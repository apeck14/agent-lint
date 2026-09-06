import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import type { CommandResult, Finding } from './cli-types.js'
import { COMPETING_CONFIG_NAMES, OXFMT_CONFIG_NAMES, OXLINT_CONFIG_NAMES } from './config-files.js'
import { PACKAGE_NAME, PACKAGE_VERSION } from './package-metadata.js'
import { resolvePackageBin, runProcess } from './process.js'
import { detectPackageManager, isGitRepository, readPackageJson } from './project.js'

const WALK_IGNORES = new Set([
  '.cache',
  '.git',
  '.next',
  '.pnpm',
  '.pnpm-store',
  '.turbo',
  '.yarn',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'vendor'
])
const EXPECTED_SCRIPTS: Record<string, RegExp> = {
  check: /agent-lint\s+check/,
  deadcode: /agent-lint\s+deadcode/,
  fix: /agent-lint\s+fix/,
  format: /agent-lint\s+format\b.*--write/,
  'format:check': /agent-lint\s+format\b.*--check/,
  lint: /agent-lint\s+lint(?:\s|$)/,
  'lint:fix': /agent-lint\s+lint\b.*--fix/
}

function finding(
  cwd: string,
  rule: string,
  message: string,
  severity: Finding['severity'] = 'error',
  file = 'package.json'
): Finding {
  return {
    column: 1,
    file: join(cwd, file),
    line: 1,
    message,
    rule: `doctor/${rule}`,
    severity,
    tool: 'doctor'
  }
}

function existing(cwd: string, names: readonly string[]): string[] {
  return names.filter((name) => existsSync(join(cwd, name)))
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function workflowFiles(cwd: string): string[] {
  const directory = join(cwd, '.github', 'workflows')
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort(compareText)
}

function walkFiles(cwd: string): string[] {
  const files: string[] = []
  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      compareText(left.name, right.name)
    )
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!WALK_IGNORES.has(entry.name)) visit(join(directory, entry.name))
      } else if (entry.isFile()) {
        files.push(join(directory, entry.name))
      }
    }
  }
  visit(cwd)
  return files
}

function lineCount(content: string): number {
  if (!content) return 0
  return content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0)
}

function hasRepositoryLfPolicy(cwd: string): boolean {
  const path = join(cwd, '.gitattributes')
  if (!existsSync(path)) return false
  return /^\s*\*\s+text(?:=auto)?\s+eol=lf\s*$/m.test(readFileSync(path, 'utf8'))
}

function effectiveInstructionSize(cwd: string, agentsPath: string): { lines: number; tokens: number } {
  let directory = dirname(agentsPath)
  let bytes = 0
  let lines = 0
  while (directory.startsWith(cwd)) {
    const candidate = join(directory, 'AGENTS.md')
    if (existsSync(candidate)) {
      const content = readFileSync(candidate, 'utf8')
      bytes += Buffer.byteLength(content, 'utf8')
      lines += lineCount(content)
    }
    if (directory === cwd) break
    directory = dirname(directory)
  }
  return { lines, tokens: Math.ceil(bytes / 4) }
}

function allDependencies(packageJson: ReturnType<typeof readPackageJson>): Record<string, string> {
  return {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
    ...(packageJson.peerDependencies ?? {})
  }
}

async function sensitiveFiles(cwd: string): Promise<string[]> {
  if (!(await isGitRepository(cwd))) return []
  const result = await runProcess('git', ['ls-files', '-z'], cwd)
  if (result.exitCode !== 0) return []

  return result.stdout
    .split('\0')
    .filter(Boolean)
    .filter((path) => {
      const name = path.split('/').at(-1) ?? path
      const example = /(?:^|\.)(?:example|sample|template)(?:\.|$)/i.test(name)
      return (
        !example &&
        (/^\.env(?:\..+)?$/i.test(name) ||
          /^(?:id_rsa|id_ed25519|credentials\.json)$/i.test(name) ||
          /\.(?:pem|key|p12|pfx)$/i.test(name))
      )
    })
}

export async function runDoctor(cwd: string): Promise<CommandResult> {
  const findings: Finding[] = []
  const notes: string[] = []

  const [major, minor] = process.versions.node.split('.').map(Number)
  if ((major ?? 0) < 22 || ((major ?? 0) === 22 && (minor ?? 0) < 18)) {
    findings.push(finding(cwd, 'node-version', `Node ${process.versions.node} is unsupported; use Node 22.18 or newer`))
  }

  let packageJson: ReturnType<typeof readPackageJson>
  let manager: ReturnType<typeof detectPackageManager>
  try {
    packageJson = readPackageJson(cwd)
    manager = detectPackageManager(cwd, packageJson)
    notes.push(`package manager: ${manager}`)
  } catch (error) {
    return {
      exitCode: 2,
      findings: [finding(cwd, 'project', error instanceof Error ? error.message : String(error))]
    }
  }

  const managerVersion = await runProcess(manager, ['--version'], cwd)
  if (managerVersion.exitCode !== 0) {
    findings.push(finding(cwd, 'package-manager', `${manager} is unavailable`))
  } else {
    const declaredVersion = packageJson.packageManager?.split('@').slice(1).join('@').split('+')[0]
    if (declaredVersion && managerVersion.stdout.trim() !== declaredVersion) {
      notes.push(
        `advice: packageManager declares ${manager}@${declaredVersion}, current executable is ${managerVersion.stdout.trim()}`
      )
    }
  }

  const dependencies = allDependencies(packageJson)
  const isPackageRepository = packageJson.name === PACKAGE_NAME && packageJson.version === PACKAGE_VERSION
  if (!isPackageRepository && packageJson.devDependencies?.[PACKAGE_NAME] !== PACKAGE_VERSION) {
    findings.push(finding(cwd, 'dependency', `Install ${PACKAGE_NAME}@${PACKAGE_VERSION} as an exact dev dependency`))
  }

  for (const [name, relativeBin] of [
    ['oxlint', 'bin/oxlint'],
    ['oxfmt', 'bin/oxfmt'],
    ['knip', 'bin/knip.js']
  ] as const) {
    try {
      resolvePackageBin(name, relativeBin)
    } catch (error) {
      findings.push(
        finding(cwd, 'binary', `${name} is unavailable: ${error instanceof Error ? error.message : String(error)}`)
      )
    }
  }

  for (const [label, names] of [
    ['Oxlint', OXLINT_CONFIG_NAMES],
    ['Oxfmt', OXFMT_CONFIG_NAMES]
  ] as const) {
    const configs = existing(cwd, names)
    if (configs.length === 0) findings.push(finding(cwd, 'config-missing', `${label} configuration is missing`))
    if (configs.length > 1)
      findings.push(finding(cwd, 'config-duplicate', `Multiple ${label} configurations found: ${configs.join(', ')}`))
    const config = configs[0]
    const configContent = config ? readFileSync(join(cwd, config), 'utf8') : ''
    const localFactory = isPackageRepository && configContent.includes("'./dist/index.js'")
    if (config && !configContent.includes(PACKAGE_NAME) && !localFactory) {
      findings.push(finding(cwd, 'config-import', `${config} does not reference ${PACKAGE_NAME}`, 'error', config))
    }
  }

  const scripts = packageJson.scripts ?? {}
  if (!isPackageRepository) {
    for (const [name, pattern] of Object.entries(EXPECTED_SCRIPTS)) {
      const candidates = [scripts[name], scripts[`agent:${name}`]].filter((value): value is string => Boolean(value))
      if (!candidates.some((value) => pattern.test(value))) {
        findings.push(finding(cwd, 'script', `No ${name} script is wired to the expected agent-lint command`))
      }
    }
  }

  const competing = [
    ...Object.keys(dependencies).filter(
      (name) =>
        name === 'eslint' ||
        name === 'prettier' ||
        name.startsWith('@eslint/') ||
        name.includes('eslint-') ||
        name.includes('prettier-')
    ),
    ...existing(cwd, COMPETING_CONFIG_NAMES)
  ]
  if (competing.length > 0) notes.push(`advice: review competing tooling before removal: ${competing.join(', ')}`)

  const workflows = workflowFiles(cwd)
  if (workflows.length === 0) {
    notes.push('advice: no GitHub Actions workflow was found')
  } else {
    const content = workflows.map((path) => readFileSync(path, 'utf8')).join('\n')
    const scriptNames = Object.keys(scripts).filter(
      (name) => /^(?:agent:)?check$/.test(name) && scripts[name]?.includes('agent-lint check')
    )
    const selfCheck = isPackageRepository && /\bpnpm\s+(?:run\s+)?check\b/.test(content)
    if (
      !selfCheck &&
      !content.includes('agent-lint check') &&
      !scriptNames.some((name) =>
        new RegExp(`(?:run|npm|pnpm|yarn|bun)[^\\n]*${name.replace(':', '\\:')}`).test(content)
      )
    ) {
      notes.push('advice: CI does not appear to run the agent-lint check')
    }
  }

  if (!hasRepositoryLfPolicy(cwd)) {
    notes.push(
      'advice: .gitattributes does not enforce repository-wide LF endings; Windows checkouts may fail formatting'
    )
  }

  const repositoryFiles = walkFiles(cwd)
  const agentFiles = repositoryFiles.filter((path) => /(?:^|[\\/])AGENTS\.md$/.test(path))
  const agentsPath = join(cwd, 'AGENTS.md')
  if (!existsSync(agentsPath)) {
    notes.push('advice: AGENTS.md is missing')
  }
  const largestEffective = agentFiles
    .map((path) => ({ ...effectiveInstructionSize(cwd, path), path }))
    .sort((left, right) => right.tokens - left.tokens || compareText(left.path, right.path))[0]
  if (largestEffective && (largestEffective.lines >= 200 || largestEffective.tokens >= 1500)) {
    notes.push(
      `advice: effective agent instructions reach ${largestEffective.lines} lines and approximately ${largestEffective.tokens} tokens at ${relative(cwd, largestEffective.path).replaceAll('\\', '/')}`
    )
  }

  const claudeFiles = repositoryFiles.filter((path) => /(?:^|[\\/])CLAUDE\.md$/.test(path))
  for (const claudePath of claudeFiles) {
    if (
      readFileSync(claudePath, 'utf8').includes('@AGENTS.md') &&
      !existsSync(join(dirname(claudePath), 'AGENTS.md'))
    ) {
      findings.push(
        finding(
          cwd,
          'claude-import',
          'CLAUDE.md imports a missing adjacent AGENTS.md',
          'error',
          relative(cwd, claudePath)
        )
      )
    }
  }

  const toolInstructions = repositoryFiles.filter(
    (path) =>
      /(?:^|[\\/])(?:\.cursorrules|copilot-instructions\.md)$/.test(path) || /[\\/]\.cursor[\\/]rules[\\/]/.test(path)
  )
  for (const path of toolInstructions) {
    notes.push(`advice: review ${relative(cwd, path).replaceAll('\\', '/')} for duplicated always-loaded instructions`)
  }

  for (const path of await sensitiveFiles(cwd)) {
    notes.push(`security advice: review tracked secret-shaped file ${path}`)
  }

  return { exitCode: findings.length > 0 ? 1 : 0, findings, notes }
}
