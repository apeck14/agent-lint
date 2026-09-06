import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import type { CommandResult, Finding } from './cli-types.js'
import { resolvePackageBin, runProcess } from './process.js'
import { detectPackageManager, isGitRepository, readPackageJson } from './project.js'

const PACKAGE_NAME = '@apehk/agent-lint'
const PACKAGE_VERSION = '1.0.0'
const OXLINT_CONFIGS = ['.oxlintrc.json', '.oxlintrc.jsonc', 'oxlint.config.ts', 'oxlint.config.mts']
const OXFMT_CONFIGS = ['.oxfmtrc.json', '.oxfmtrc.jsonc', 'oxfmt.config.ts', 'oxfmt.config.mts']
const WALK_IGNORES = new Set(['.git', '.next', '.turbo', 'build', 'coverage', 'dist', 'node_modules', 'out', 'vendor'])
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

function existing(cwd: string, names: string[]): string[] {
  return names.filter((name) => existsSync(join(cwd, name)))
}

function workflowFiles(cwd: string): string[] {
  const directory = join(cwd, '.github', 'workflows')
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => join(directory, entry.name))
}

function walkFiles(cwd: string): string[] {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
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

function lineCount(path: string): number {
  return readFileSync(path, 'utf8').split(/\r?\n/).length
}

function effectiveInstructionLines(cwd: string, agentsPath: string): number {
  let directory = dirname(agentsPath)
  let total = 0
  while (directory.startsWith(cwd)) {
    const candidate = join(directory, 'AGENTS.md')
    if (existsSync(candidate)) total += lineCount(candidate)
    if (directory === cwd) break
    directory = dirname(directory)
  }
  return total
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
      exitCode: 1,
      findings: [finding(cwd, 'project', error instanceof Error ? error.message : String(error))]
    }
  }

  const managerVersion = await runProcess(manager, ['--version'], cwd)
  if (managerVersion.exitCode !== 0) {
    findings.push(finding(cwd, 'package-manager', `${manager} is unavailable`))
  } else {
    const declaredVersion = packageJson.packageManager?.split('@').slice(1).join('@')
    if (declaredVersion && !managerVersion.stdout.trim().startsWith(declaredVersion)) {
      notes.push(
        `advice: packageManager declares ${manager}@${declaredVersion}, current executable is ${managerVersion.stdout.trim()}`
      )
    }
  }

  const dependencies = allDependencies(packageJson)
  const isPackageRepository = packageJson.name === PACKAGE_NAME && packageJson.version === PACKAGE_VERSION
  if (!isPackageRepository && dependencies[PACKAGE_NAME] !== PACKAGE_VERSION) {
    findings.push(finding(cwd, 'dependency', `Install ${PACKAGE_NAME}@${PACKAGE_VERSION} as an exact dev dependency`))
  }

  for (const [name, relativeBin] of [
    ['oxlint', 'bin/oxlint'],
    ['oxfmt', 'bin/oxfmt'],
    ['knip', 'bin/knip.js']
  ] as const) {
    try {
      resolvePackageBin(name, relativeBin, cwd)
    } catch (error) {
      findings.push(
        finding(cwd, 'binary', `${name} is unavailable: ${error instanceof Error ? error.message : String(error)}`)
      )
    }
  }

  for (const [label, names] of [
    ['Oxlint', OXLINT_CONFIGS],
    ['Oxfmt', OXFMT_CONFIGS]
  ] as const) {
    const configs = existing(cwd, [...names])
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

  const competing = Object.keys(dependencies).filter(
    (name) =>
      name === 'eslint' ||
      name === 'prettier' ||
      name.startsWith('@eslint/') ||
      name.includes('eslint-') ||
      name.includes('prettier-')
  )
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

  const repositoryFiles = walkFiles(cwd)
  const agentFiles = repositoryFiles.filter((path) => /(?:^|[\\/])AGENTS\.md$/.test(path))
  const agentsPath = join(cwd, 'AGENTS.md')
  if (!existsSync(agentsPath)) {
    notes.push('advice: AGENTS.md is missing')
  }
  const largestEffective = agentFiles
    .map((path) => ({ lines: effectiveInstructionLines(cwd, path), path }))
    .sort((left, right) => right.lines - left.lines)[0]
  if (largestEffective && largestEffective.lines > 200) {
    notes.push(
      `advice: effective agent instructions reach ${largestEffective.lines} lines at ${relative(cwd, largestEffective.path).replaceAll('\\', '/')}`
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
