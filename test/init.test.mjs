import assert from 'node:assert/strict'
import test from 'node:test'

import { jsonResult, read, run, snapshot, temporaryDirectory, write } from './helpers.mjs'

test('init dry-run reports exact changes without writing', (t) => {
  const directory = temporaryDirectory(t)
  write(directory, 'package.json', '{"name":"fixture","packageManager":"npm@11.0.0"}\n')
  const before = snapshot(directory)
  const result = run(directory, ['init', '--dry-run', '--format', 'json'])
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.deepEqual(snapshot(directory), before)
  assert.match(jsonResult(result).notes.join('\n'), /install @apehk\/agent-lint@1\.0\.0 as an exact dev dependency/)
  assert.match(jsonResult(result).notes.join('\n'), /create oxlint\.config\.ts/)
})

test('init is deterministic, detects presets, and is byte-for-byte idempotent', (t) => {
  const directory = temporaryDirectory(t)
  write(
    directory,
    'package.json',
    `${JSON.stringify({ name: 'fixture', packageManager: 'pnpm@11.25.0', dependencies: { next: '16.0.0' }, devDependencies: { jest: '30.0.0' } })}\n`
  )
  const environment = { AGENT_LINT_SKIP_INSTALL: '1' }
  const first = run(directory, ['init', '--format', 'json'], { env: environment })
  assert.equal(first.status, 0, first.stderr || first.stdout)
  const firstSnapshot = snapshot(directory)
  const second = run(directory, ['init', '--format', 'json'], { env: environment })
  assert.equal(second.status, 0, second.stderr || second.stdout)
  assert.deepEqual(snapshot(directory), firstSnapshot)
  assert.match(read(directory, 'oxlint.config.ts'), /environment: 'universal'/)
  assert.match(read(directory, 'oxlint.config.ts'), /framework: 'next'/)
  assert.match(read(directory, 'oxlint.config.ts'), /testRunner: 'jest'/)
  assert.equal(read(directory, 'CLAUDE.md'), '@AGENTS.md\n')
  const packageJson = JSON.parse(read(directory, 'package.json'))
  assert.equal(packageJson.devDependencies['@apehk/agent-lint'], '1.0.0')
  assert.equal(packageJson.scripts.check, 'agent-lint check')
})

test('init preserves custom files and script collisions', (t) => {
  const directory = temporaryDirectory(t)
  write(
    directory,
    'package.json',
    `${JSON.stringify({ name: 'fixture', packageManager: 'npm@11.0.0', scripts: { lint: 'custom-lint' } })}\n`
  )
  write(directory, 'oxlint.config.ts', 'export default { rules: {} }\n')
  const result = run(directory, ['init', '--format', 'json'], { env: { AGENT_LINT_SKIP_INSTALL: '1' } })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(read(directory, 'oxlint.config.ts'), 'export default { rules: {} }\n')
  const packageJson = JSON.parse(read(directory, 'package.json'))
  assert.equal(packageJson.scripts.lint, 'custom-lint')
  assert.equal(packageJson.scripts['agent:lint'], 'agent-lint lint')
  assert.match(read(directory, 'AGENTS.md'), /npm run fix -- --changed/)
})

test('init detects framework and test-runner repository files', (t) => {
  const directory = temporaryDirectory(t)
  write(directory, 'package.json', '{"name":"fixture","packageManager":"npm@11.0.0"}\n')
  write(directory, 'next.config.mjs', 'export default {}\n')
  write(directory, 'vitest.config.ts', 'export default {}\n')
  const result = run(directory, ['init', '--format', 'json'], { env: { AGENT_LINT_SKIP_INSTALL: '1' } })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(read(directory, 'oxlint.config.ts'), /environment: 'universal'/)
  assert.match(read(directory, 'oxlint.config.ts'), /framework: 'next'/)
  assert.match(read(directory, 'oxlint.config.ts'), /testRunner: 'vitest'/)
})

test('ambiguous lockfiles fail without mutation', (t) => {
  const directory = temporaryDirectory(t)
  write(directory, 'package.json', '{"name":"fixture"}\n')
  write(directory, 'package-lock.json', '{}\n')
  write(directory, 'pnpm-lock.yaml', 'lockfileVersion: 9\n')
  const before = snapshot(directory)
  const result = run(directory, ['init', '--format', 'json'])
  assert.equal(result.status, 2)
  assert.match(jsonResult(result).findings[0].message, /Multiple package-manager lockfiles/)
  assert.deepEqual(snapshot(directory), before)
})
