import assert from 'node:assert/strict'
import test from 'node:test'

import { createProject, jsonResult, read, run, write } from './helpers.mjs'

test('check is clean and format defaults to check mode', (t) => {
  const directory = createProject(t)
  write(directory, 'src/good.ts', 'export const answer = 42\n')

  const clean = run(directory, ['check', 'src', '--format', 'json'])
  assert.equal(clean.status, 0, clean.stderr || clean.stdout)
  assert.equal(jsonResult(clean).total, 0)

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
})

test('unmatched paths are clean', (t) => {
  const directory = createProject(t)
  const result = run(directory, ['check', 'missing/**/*.ts', '--format', 'json'])
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(jsonResult(result).total, 0)
})

test('GitHub annotations are automatic but explicit formats win', (t) => {
  const directory = createProject(t)
  write(directory, 'src/bad.ts', 'debugger\n')
  const automatic = run(directory, ['lint', 'src/bad.ts'], { env: { GITHUB_ACTIONS: 'true' } })
  assert.match(automatic.stdout, /^::error /)

  const explicit = run(directory, ['lint', 'src/bad.ts', '--format', 'agent'], { env: { GITHUB_ACTIONS: 'true' } })
  assert.doesNotMatch(explicit.stdout, /^::error /)
  assert.match(explicit.stdout, /^src\/bad\.ts:1:1 /)
})
