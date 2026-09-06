import assert from 'node:assert/strict'
import test from 'node:test'

import { jsonResult, read, run, snapshot, temporaryDirectory, write } from './helpers.mjs'

test('init dry-run reports exact changes without writing', (t) => {
  const directory = temporaryDirectory(t)
  write(directory, 'package.json', '{"name":"fixture","packageManager":"npm@11.0.0"}\n')
  write(directory, '.prettierrc', '{}\n')
  const before = snapshot(directory)
  const result = run(directory, ['init', '--dry-run', '--format', 'json'])
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.deepEqual(snapshot(directory), before)
  assert.match(jsonResult(result).notes.join('\n'), /install @apeck14\/agent-lint@1\.0\.0 as an exact dev dependency/)
  assert.match(jsonResult(result).notes.join('\n'), /create oxlint\.config\.mts/)
  assert.match(jsonResult(result).notes.join('\n'), /create \.gitattributes with LF normalization/)
  assert.match(jsonResult(result).notes.join('\n'), /review competing tooling before removal: \.prettierrc/)
})

test('init is deterministic, detects presets, and is byte-for-byte idempotent', (t) => {
  const directory = temporaryDirectory(t)
  write(
    directory,
    'package.json',
    `${JSON.stringify({ name: 'fixture', packageManager: 'pnpm@11.25.0', type: 'module', dependencies: { next: '16.0.0' }, devDependencies: { jest: '30.0.0' } })}\n`
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
  assert.equal(packageJson.devDependencies['@apeck14/agent-lint'], '1.0.0')
  assert.equal(packageJson.scripts.check, 'agent-lint check')
})

test('init does not mistake server-rendered React for a browser runtime', (t) => {
  const directory = temporaryDirectory(t)
  write(
    directory,
    'package.json',
    `${JSON.stringify({ name: 'fixture', packageManager: 'pnpm@11.25.0', type: 'module', dependencies: { react: '19.0.0' } })}\n`
  )
  const result = run(directory, ['init', '--format', 'json'], { env: { AGENT_LINT_SKIP_INSTALL: '1' } })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(read(directory, 'oxlint.config.ts'), /environment: 'node'/)
  assert.match(read(directory, 'oxlint.config.ts'), /framework: 'react'/)
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
  assert.equal(snapshot(directory)['oxlint.config.mts'], undefined)
  const packageJson = JSON.parse(read(directory, 'package.json'))
  assert.equal(packageJson.scripts.lint, 'custom-lint')
  assert.equal(packageJson.scripts['agent:lint'], 'agent-lint lint')
  assert.match(read(directory, 'AGENTS.md'), /npm run fix -- --changed/)
})

test('init keeps agent-lint only as an exact development dependency', (t) => {
  const directory = temporaryDirectory(t)
  write(
    directory,
    'package.json',
    `${JSON.stringify({ dependencies: { '@apeck14/agent-lint': '1.0.0' }, name: 'fixture', packageManager: 'npm@11.0.0' })}\n`
  )
  const result = run(directory, ['init', '--format', 'json'], { env: { AGENT_LINT_SKIP_INSTALL: '1' } })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const packageJson = JSON.parse(read(directory, 'package.json'))
  assert.equal(packageJson.devDependencies['@apeck14/agent-lint'], '1.0.0')
  assert.equal(packageJson.dependencies, undefined)
})

test('init makes local typechecking and existing tests part of the final agent workflow', (t) => {
  const directory = temporaryDirectory(t)
  write(
    directory,
    'package.json',
    `${JSON.stringify({ name: 'fixture', packageManager: 'pnpm@11.25.0', scripts: { test: 'node --test' }, devDependencies: { typescript: '5.9.2' } })}\n`
  )
  write(directory, 'tsconfig.json', '{"include":["src"]}\n')
  const result = run(directory, ['init', '--format', 'json'], { env: { AGENT_LINT_SKIP_INSTALL: '1' } })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const packageJson = JSON.parse(read(directory, 'package.json'))
  assert.equal(packageJson.scripts.check, 'agent-lint check --typecheck')
  assert.equal(read(directory, '.gitattributes'), '* text=auto eol=lf\n')
  const instructions = read(directory, 'AGENTS.md')
  assert.ok(instructions.trim().split(/\s+/).length <= 100)
  assert.match(instructions, /<!-- agent-lint:start -->\n\n## Agent checks/)
  assert.match(instructions, /pnpm run check/)
  assert.match(instructions, /pnpm run test/)
  assert.match(instructions, /Run relevant tests/)
  assert.match(instructions, /for broad or shared changes/)
  assert.match(instructions, /if unrelated changes exist, replace `--changed` with only paths you edited/)
  assert.match(instructions, /do not weaken rules or add ignores unless explicitly requested/)
  assert.match(instructions, /mock only external, nondeterministic, or prohibitively expensive boundaries/)
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
