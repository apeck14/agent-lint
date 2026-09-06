import assert from 'node:assert/strict'
import test from 'node:test'

import { createProject, jsonResult, read, run, write } from './helpers.mjs'

test('check is clean and format defaults to check mode', (t) => {
  const directory = createProject(t)
  write(directory, 'src/good.ts', 'export const answer = 42\n')

  const clean = run(directory, ['check', 'src', '--format', 'json'])
  assert.equal(clean.status, 0, clean.stderr || clean.stdout)
  assert.equal(jsonResult(clean).total, 0)

  const unmatched = run(directory, ['check', 'missing/**/*.ts', '--format', 'json'])
  assert.equal(unmatched.status, 0, unmatched.stderr || unmatched.stdout)
  assert.equal(jsonResult(unmatched).total, 0)

  write(directory, 'src/bad.ts', 'export const message="hello";\n')
  const format = run(directory, ['format', 'src/bad.ts', '--format', 'json'])
  assert.equal(format.status, 1)
  assert.equal(jsonResult(format).findings[0].rule, 'format')
  assert.equal(read(directory, 'src/bad.ts'), 'export const message="hello";\n')
})

test('format write and safe lint fixes modify files', (t) => {
  const directory = createProject(t)
  write(directory, 'src/format.ts', 'export const message="hello";\n')
  const formatted = run(directory, ['format', 'src/format.ts', '--write'])
  assert.equal(formatted.status, 0, formatted.stderr || formatted.stdout)
  assert.equal(read(directory, 'src/format.ts'), "export const message = 'hello'\n")

  write(directory, 'src/fix.ts', 'export let value = 1\n')
  const fixed = run(directory, ['lint', 'src/fix.ts', '--fix'])
  assert.equal(fixed.status, 0, fixed.stderr || fixed.stdout)
  assert.equal(read(directory, 'src/fix.ts'), 'export const value = 1\n')
})

test('agent diagnostics are deterministic and capped', (t) => {
  const directory = createProject(t)
  write(directory, 'src/many.ts', Array.from({ length: 100 }, () => 'debugger').join('\n'))
  const result = run(directory, ['lint', 'src/many.ts', '--format', 'json'])
  const output = jsonResult(result)
  assert.equal(result.status, 1)
  assert.equal(output.findings.length, 50)
  assert.equal(output.omitted, 50)
  assert.equal(output.total, 100)
  assert.match(output.rerun, /--no-diagnostic-limit$/)
  assert.ok(
    output.findings.every((finding) => finding.rule === 'eslint/no-debugger'),
    JSON.stringify(output)
  )

  const unlimited = run(directory, ['lint', 'src/many.ts', '--format', 'json', '--no-diagnostic-limit'])
  assert.equal(jsonResult(unlimited).findings.length, 100)
})

test('parse failures are findings and usage failures exit 2', (t) => {
  const directory = createProject(t)
  write(directory, 'src/parse.ts', 'const = broken\n')
  const parse = run(directory, ['lint', 'src/parse.ts', '--format', 'json'])
  assert.equal(parse.status, 1)
  assert.equal(jsonResult(parse).total, 1)

  const usage = run(directory, ['check', 'src', '--changed'])
  assert.equal(usage.status, 2)
  assert.match(usage.stdout, /Paths cannot be combined/)

  for (const args of [
    ['fix', '--since', ''],
    ['deadcode', 'src'],
    ['doctor', 'src'],
    ['init', 'src']
  ]) {
    const invalid = run(directory, args)
    assert.equal(invalid.status, 2, invalid.stdout)
  }
})

test('paths beginning with a dash remain filenames through check and fix', (t) => {
  const directory = createProject(t)
  write(directory, '-input.ts', 'export const value=1;\n')
  const check = run(directory, ['check', '--format', 'json', '--', '-input.ts'])
  assert.equal(check.status, 1, check.stdout)
  assert.equal(jsonResult(check).findings[0].rule, 'format')
  const fixed = run(directory, ['fix', '--', '-input.ts'])
  assert.equal(fixed.status, 0, fixed.stdout)
  assert.equal(read(directory, '-input.ts'), 'export const value = 1\n')
})

test('GitHub annotations are automatic, escaped, and explicitly overridable', (t) => {
  const directory = createProject(t)
  write(directory, 'src/comma,name.ts', 'debugger\n')

  const automatic = run(directory, ['lint', 'src/comma,name.ts'], { env: { GITHUB_ACTIONS: 'true' } })
  assert.equal(automatic.status, 1)
  assert.match(automatic.stdout, /^::error file=src\/comma%2Cname\.ts,/)

  const explicit = run(directory, ['lint', 'src/comma,name.ts', '--format', 'agent'], {
    env: { GITHUB_ACTIONS: 'true' }
  })
  assert.equal(explicit.status, 1)
  assert.doesNotMatch(explicit.stdout, /^::error /)
  assert.match(explicit.stdout, /^src\/comma,name\.ts:1:1 /)
})

test('consumer-installed tools cannot override the package engines', (t) => {
  const directory = createProject(t)
  write(directory, 'src/index.ts', 'export const value = true\n')
  write(
    directory,
    'node_modules/oxlint/package.json',
    '{"name":"oxlint","version":"0.0.0","exports":{"./package.json":"./package.json"}}\n'
  )
  write(directory, 'node_modules/oxlint/bin/oxlint', 'process.exit(99)\n')
  const result = run(directory, ['lint', 'src/index.ts', '--format', 'json'])
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('React hook checks cover ordinary TypeScript and respect consumer overrides', (t) => {
  const directory = createProject(t, { oxlint: { framework: 'react' } })
  write(
    directory,
    'src/hooks.ts',
    'export function useValue(enabled: boolean) {\n  if (enabled) return useState(0)\n  return null\n}\n'
  )
  const invalid = run(directory, ['lint', 'src/hooks.ts', '--format', 'json'])
  assert.ok(
    jsonResult(invalid).findings.some((finding) => finding.rule === 'react-hooks/rules-of-hooks'),
    invalid.stdout
  )

  write(directory, 'src/hooks.ts', 'export function useValue() {\n  return useState(0)\n}\n')
  const valid = run(directory, ['lint', 'src/hooks.ts', '--format', 'json'])
  assert.equal(valid.status, 0, valid.stdout)

  const customized = createProject(t, { oxlint: { framework: 'react', rules: { 'react/rules-of-hooks': 'off' } } })
  write(
    customized,
    'src/hooks.tsx',
    'export function useValue(enabled: boolean) {\n  if (enabled) return useState(0)\n  return null\n}\n'
  )
  const overridden = run(customized, ['lint', 'src/hooks.tsx', '--format', 'json'])
  assert.equal(overridden.status, 0, overridden.stdout)
})

test('repository import restrictions retain actionable repair messages', (t) => {
  const message = 'Use node:fs/promises for asynchronous filesystem access.'
  const directory = createProject(t, {
    oxlint: { rules: { 'no-restricted-imports': ['error', { paths: [{ name: 'node:fs', message }] }] } }
  })
  write(directory, 'src/files.ts', "export { readFileSync } from 'node:fs'\n")
  const result = run(directory, ['lint', 'src/files.ts', '--format', 'json'])
  assert.equal(result.status, 1, result.stdout)
  const finding = jsonResult(result).findings.find((entry) => entry.rule === 'eslint/no-restricted-imports')
  assert.ok(finding, result.stdout)
  assert.ok(finding.message.includes(message), result.stdout)
  const agent = run(directory, ['lint', 'src/files.ts', '--format', 'agent'])
  assert.ok(agent.stdout.includes(message), agent.stdout)
  assert.equal(agent.stdout.trim().split('\n').length, 1)
})

test('agent guardrails reject unsafe production assertions and commented-out tests', (t) => {
  const directory = createProject(t, { oxlint: { testRunner: 'jest' } })
  write(
    directory,
    'src/assertion.ts',
    'export function length(value: string | undefined) {\n  return value!.length\n}\n'
  )
  const production = run(directory, ['lint', 'src/assertion.ts', '--format', 'json'])
  assert.equal(production.status, 1)
  assert.ok(jsonResult(production).findings.some((finding) => finding.rule === 'typescript/no-non-null-assertion'))

  write(
    directory,
    'tests/assertion.test.ts',
    'export function length(value: string | undefined) {\n  return value!.length\n}\n'
  )
  const testAssertion = run(directory, ['lint', 'tests/assertion.test.ts', '--format', 'json'])
  assert.equal(testAssertion.status, 0, testAssertion.stderr || testAssertion.stdout)

  write(directory, 'tests/commented.test.ts', "// test('later', () => {})\n")
  const commented = run(directory, ['lint', 'tests/commented.test.ts', '--format', 'json'])
  assert.equal(commented.status, 1)
  assert.ok(jsonResult(commented).findings.some((finding) => finding.rule === 'jest/no-commented-out-tests'))

  write(directory, 'src/stale-disable.js', '/* eslint-disable no-console */\nexport const ready = true\n')
  const staleDisable = run(directory, ['lint', 'src/stale-disable.js', '--format', 'json'])
  assert.equal(staleDisable.status, 1)
  assert.equal(jsonResult(staleDisable).findings[0].rule, 'oxlint/unused-disable')
})
