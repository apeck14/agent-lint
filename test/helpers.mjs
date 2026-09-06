import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const cli = join(root, 'dist', 'cli.js')
const packageEntry = pathToFileURL(join(root, 'dist', 'index.js')).href

export function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'agent-lint-'))
  t.after(() => rmSync(directory, { force: true, recursive: true }))
  return directory
}

export function write(directory, relativePath, content) {
  const path = join(directory, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

export function read(directory, relativePath) {
  return readFileSync(join(directory, relativePath), 'utf8')
}

export function createProject(t, options = {}) {
  const directory = temporaryDirectory(t)
  const packageJson = {
    name: 'fixture',
    private: true,
    type: 'module',
    packageManager: 'npm@11.0.0',
    ...options.packageJson
  }
  const configExtension = packageJson.type === 'module' ? 'ts' : 'mts'
  write(directory, 'package.json', `${JSON.stringify(packageJson, null, 2)}\n`)
  write(
    directory,
    `oxlint.config.${configExtension}`,
    `import { createOxlintConfig } from '${packageEntry}'\nexport default createOxlintConfig(${JSON.stringify(options.oxlint ?? {})})\n`
  )
  write(
    directory,
    `oxfmt.config.${configExtension}`,
    `import { createOxfmtConfig } from '${packageEntry}'\nexport default createOxfmtConfig(${JSON.stringify(options.oxfmt ?? {})})\n`
  )
  return directory
}

export function run(directory, args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...options.env },
    windowsHide: true
  })
}

export function jsonResult(result) {
  return JSON.parse(result.stdout)
}

export function git(directory, args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true })
}

export function snapshot(directory) {
  function visit(path, prefix = '') {
    const result = {}
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      if (entry.name === '.git') continue
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) Object.assign(result, visit(join(path, entry.name), relativePath))
      else result[relativePath] = readFileSync(join(path, entry.name), 'utf8')
    }
    return result
  }
  return visit(directory)
}
