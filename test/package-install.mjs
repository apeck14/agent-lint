import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(join(tmpdir(), 'agent-lint-package-'))
const consumer = join(directory, 'consumer')
const pnpmCli = process.env.npm_execpath

if (!pnpmCli) throw new Error('pnpm CLI path is unavailable')

function pnpm(args, cwd) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    windowsHide: true
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result
}

try {
  pnpm(['pack', '--pack-destination', directory], root)
  const tarball = readdirSync(directory)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(directory, name))[0]
  assert.ok(tarball, 'pnpm pack did not create a tarball')

  mkdirSync(consumer)
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'packed-consumer', packageManager: 'pnpm@11.25.0', private: true })}\n`,
    'utf8'
  )
  pnpm(['add', '--offline', '--ignore-scripts', '--save-exact', tarball], consumer)

  const installedRoot = join(consumer, 'node_modules', '@apeck14', 'agent-lint')
  const manifest = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'))
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['knip', 'oxfmt', 'oxlint'])
  for (const lifecycle of ['install', 'postinstall', 'preinstall', 'prepare']) {
    assert.equal(manifest.scripts?.[lifecycle], undefined)
  }
  assert.equal(readdirSync(installedRoot).includes('src'), false)
  assert.equal(readdirSync(installedRoot).includes('test'), false)

  const api = await import(pathToFileURL(join(installedRoot, 'dist', 'index.js')).href)
  assert.equal(typeof api.createOxlintConfig, 'function')
  assert.equal(typeof api.createOxfmtConfig, 'function')

  const cliPath = join(installedRoot, 'dist', 'cli.js')
  const initialized = spawnSync(process.execPath, [cliPath, 'init', '--format', 'json'], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, AGENT_LINT_SKIP_INSTALL: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
    windowsHide: true
  })
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout)
  const initializedPackage = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'))
  assert.equal(initializedPackage.devDependencies['@apeck14/agent-lint'], manifest.version)
  assert.equal(initializedPackage.scripts.check, 'agent-lint check')
  assert.match(readFileSync(join(consumer, 'AGENTS.md'), 'utf8'), /do not weaken rules or add ignores/)
  assert.equal(readFileSync(join(consumer, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n')

  mkdirSync(join(consumer, 'src'))
  writeFileSync(join(consumer, 'src', 'index.ts'), 'export const ready = true\n', 'utf8')

  const cli = spawnSync(process.execPath, [cliPath, 'check', 'src'], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    windowsHide: true
  })
  assert.equal(cli.status, 0, cli.stderr || cli.stdout)
  assert.equal(cli.stdout, 'check: clean\n')
  process.stdout.write('packed consumer: clean\n')
} finally {
  rmSync(directory, { force: true, recursive: true })
}
