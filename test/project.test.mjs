import assert from 'node:assert/strict'
import { existsSync, symlinkSync } from 'node:fs'
import test from 'node:test'

import { createProject, git, jsonResult, root, run, snapshot, write } from './helpers.mjs'

test('changed mode includes staged and untracked files', (t) => {
  const directory = createProject(t)
  write(directory, 'src/tracked.ts', 'export const tracked = true\n')
  write(directory, 'src/unstaged.ts', 'export const unstaged = true\n')
  write(directory, 'src/rename-me.ts', 'export const renamed = true\n')
  git(directory, ['init', '-b', 'main'])
  git(directory, ['config', 'core.autocrlf', 'false'])
  git(directory, ['config', 'user.name', 'Test'])
  git(directory, ['config', 'user.email', 'test@example.invalid'])
  git(directory, ['add', '.'])
  git(directory, ['commit', '-m', 'fixture'])

  write(directory, 'src/tracked.ts', 'debugger\n')
  git(directory, ['add', 'src/tracked.ts'])
  write(directory, 'src/unstaged.ts', 'debugger\n')
  git(directory, ['mv', 'src/rename-me.ts', 'src/space name.ts'])
  write(directory, 'src/space name.ts', 'debugger\n')
  write(directory, 'src/naïve.ts', 'debugger\n')
  const result = run(directory, ['check', '--changed', '--format', 'json'])
  const files = jsonResult(result)
    .findings.filter((finding) => finding.rule === 'eslint/no-debugger')
    .map((finding) => finding.file)
  assert.equal(result.status, 1)
  assert.deepEqual(new Set(files), new Set(['src/naïve.ts', 'src/space name.ts', 'src/tracked.ts', 'src/unstaged.ts']))
})

test('changed mode fails outside Git and invalid refs fail clearly', (t) => {
  const noGit = createProject(t)
  const changed = run(noGit, ['check', '--changed', '--format', 'json'])
  assert.equal(changed.status, 2)
  assert.match(jsonResult(changed).findings[0].message, /require a Git repository/)

  const repository = createProject(t)
  write(repository, 'src/index.ts', 'export const value = true\n')
  git(repository, ['init', '-b', 'main'])
  git(repository, ['config', 'core.autocrlf', 'false'])
  git(repository, ['config', 'user.name', 'Test'])
  git(repository, ['config', 'user.email', 'test@example.invalid'])
  git(repository, ['add', '.'])
  git(repository, ['commit', '-m', 'fixture'])
  const since = run(repository, ['check', '--since', 'not-a-ref', '--format', 'json'])
  assert.equal(since.status, 2)
  assert.match(jsonResult(since).findings[0].message, /not-a-ref|merge base/i)
})

test('since mode unions branch commits with working-tree changes', (t) => {
  const directory = createProject(t)
  write(directory, 'src/committed.ts', 'export const committed = true\n')
  git(directory, ['init', '-b', 'main'])
  git(directory, ['config', 'core.autocrlf', 'false'])
  git(directory, ['config', 'user.name', 'Test'])
  git(directory, ['config', 'user.email', 'test@example.invalid'])
  git(directory, ['add', '.'])
  git(directory, ['commit', '-m', 'base'])
  git(directory, ['tag', 'base'])
  write(directory, 'src/committed.ts', 'debugger\n')
  git(directory, ['add', 'src/committed.ts'])
  git(directory, ['commit', '-m', 'branch change'])
  write(directory, 'src/current.ts', 'debugger\n')

  const result = run(directory, ['check', '--since', 'base', '--format', 'json'])
  const files = jsonResult(result)
    .findings.filter((finding) => finding.rule === 'eslint/no-debugger')
    .map((finding) => finding.file)
  assert.equal(result.status, 1)
  assert.deepEqual(new Set(files), new Set(['src/committed.ts', 'src/current.ts']))
})

test('typecheck uses a non-recursive script and rejects recursion', (t) => {
  const clean = createProject(t, {
    packageJson: { scripts: { typecheck: 'node -e "process.exit(0)"' } }
  })
  write(clean, 'src/index.ts', 'export const value = true\n')
  const result = run(clean, ['check', 'src', '--typecheck', '--format', 'json'])
  assert.equal(result.status, 0, result.stderr || result.stdout)

  const recursive = createProject(t, {
    packageJson: { scripts: { typecheck: 'agent-lint check --typecheck' } }
  })
  write(recursive, 'src/index.ts', 'export const value = true\n')
  const failed = run(recursive, ['check', 'src', '--typecheck', '--format', 'json'])
  assert.equal(failed.status, 2)
  assert.match(jsonResult(failed).findings[0].rule, /recursive-script/)
})

test('direct typecheck uses the repository compiler with jsconfig', (t) => {
  const directory = createProject(t)
  write(directory, 'jsconfig.json', '{"compilerOptions":{"checkJs":true},"include":["src"]}\n')
  write(directory, 'src/index.js', '/** @type {string} */\nexport const value = 1\n')
  write(directory, 'node_modules/.keep', '')
  symlinkSync(`${root}/node_modules/typescript`, `${directory}/node_modules/typescript`, 'junction')
  const result = run(directory, ['check', 'src', '--typecheck', '--format', 'json'])
  assert.equal(result.status, 1)
  assert.ok(jsonResult(result).findings.some((finding) => finding.rule.startsWith('TS')))
})

test('typecheck reports missing configuration and missing local TypeScript', (t) => {
  const noConfig = createProject(t)
  write(noConfig, 'src/index.ts', 'export const value = true\n')
  const configResult = run(noConfig, ['check', 'src', '--typecheck', '--format', 'json'])
  assert.equal(configResult.status, 2)
  assert.ok(jsonResult(configResult).findings.some((finding) => finding.rule === 'typescript/config-missing'))

  const noCompiler = createProject(t)
  write(noCompiler, 'src/index.ts', 'export const value = true\n')
  write(noCompiler, 'tsconfig.json', '{"include":["src"]}\n')
  const compilerResult = run(noCompiler, ['check', 'src', '--typecheck', '--format', 'json'])
  assert.equal(compilerResult.status, 2)
  assert.ok(jsonResult(compilerResult).findings.some((finding) => finding.rule === 'typescript/not-installed'))
})

test('deadcode reports unused files and never deletes them', (t) => {
  const directory = createProject(t, {
    packageJson: { knip: { entry: ['src/index.js'], project: ['src/**/*.js'] } }
  })
  write(directory, 'src/index.js', "console.log('entry')\n")
  write(directory, 'src/unused.js', 'export const unused = true\n')
  const result = run(directory, ['deadcode', '--format', 'json'])
  assert.equal(result.status, 1, result.stderr || result.stdout)
  assert.ok(jsonResult(result).findings.some((finding) => finding.file === 'src/unused.js'))
  assert.equal(existsSync(`${directory}/src/unused.js`), true)
})

test('doctor separates operational failures from advice', (t) => {
  const directory = createProject(t, {
    packageJson: {
      devDependencies: { '@apehk/agent-lint': '1.0.0', eslint: '10.0.0' },
      scripts: {
        check: 'agent-lint check',
        deadcode: 'agent-lint deadcode',
        fix: 'agent-lint fix',
        format: 'agent-lint format --write',
        'format:check': 'agent-lint format --check',
        lint: 'agent-lint lint',
        'lint:fix': 'agent-lint lint --fix'
      }
    }
  })
  write(
    directory,
    'oxlint.config.ts',
    "import { createOxlintConfig } from '@apehk/agent-lint'\nexport default createOxlintConfig()\n"
  )
  write(
    directory,
    'oxfmt.config.ts',
    "import { createOxfmtConfig } from '@apehk/agent-lint'\nexport default createOxfmtConfig()\n"
  )
  write(directory, 'AGENTS.md', `${Array.from({ length: 110 }, () => 'root instruction').join('\n')}\n`)
  write(directory, 'packages/app/AGENTS.md', `${Array.from({ length: 110 }, () => 'nested instruction').join('\n')}\n`)
  write(directory, '.cursorrules', 'Use AGENTS.md.\n')
  const before = snapshot(directory)
  const result = run(directory, ['doctor', '--format', 'json'])
  const output = jsonResult(result)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(output.notes.join('\n'), /competing tooling/)
  assert.match(output.notes.join('\n'), /effective agent instructions/)
  assert.match(output.notes.join('\n'), /\.cursorrules/)
  assert.deepEqual(snapshot(directory), before)
})
