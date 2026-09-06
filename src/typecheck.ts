import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import type { CommandResult, Finding, RunResult } from './cli-types.js'
import { runProcess } from './process.js'
import { detectPackageManager, packageManagerRunArgs, readPackageJson } from './project.js'

const TYPESCRIPT_DIAGNOSTIC = /^(.*)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/

function parseOutput(result: RunResult, cwd: string): CommandResult {
  if (result.exitCode === 0) return { exitCode: 0, findings: [] }

  const lines = stripVTControlCharacters(`${result.stdout}\n${result.stderr}`)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.startsWith('$ ') &&
        !line.startsWith('> ') &&
        !line.startsWith('[ELIFECYCLE]') &&
        !/^npm (?:error|warn) /.test(line)
    )
  const findings: Finding[] = lines.map((line) => {
    const match = TYPESCRIPT_DIAGNOSTIC.exec(line)
    const file = match?.[1]
    return {
      column: Number(match?.[3] ?? 1),
      file: file ? (isAbsolute(file) ? file : join(cwd, file)) : join(cwd, 'tsconfig.json'),
      line: Number(match?.[2] ?? 1),
      message: match?.[6] ?? line,
      rule: match?.[5] ?? 'typescript',
      severity: match?.[4] === 'warning' ? 'warning' : 'error',
      tool: 'typescript'
    }
  })

  return { exitCode: findings.length > 0 ? 1 : 2, findings }
}

function resolveTypeScript(cwd: string): string | undefined {
  try {
    const require = createRequire(join(cwd, 'package.json'))
    return require.resolve('typescript/bin/tsc')
  } catch {
    return undefined
  }
}

export async function runTypecheck(cwd: string): Promise<CommandResult> {
  const packageJson = readPackageJson(cwd)
  const script = packageJson.scripts?.typecheck

  if (script) {
    if (/\bagent-lint\b/.test(script)) {
      return {
        exitCode: 2,
        findings: [
          {
            column: 1,
            file: join(cwd, 'package.json'),
            line: 1,
            message: 'The typecheck script invokes agent-lint and would recurse',
            rule: 'typescript/recursive-script',
            severity: 'error',
            tool: 'typescript'
          }
        ]
      }
    }

    const manager = detectPackageManager(cwd, packageJson)
    const [command, args] = packageManagerRunArgs(manager, 'typecheck')
    return parseOutput(await runProcess(command, args, cwd), cwd)
  }

  const config = ['tsconfig.json', 'jsconfig.json'].find((name) => existsSync(join(cwd, name)))
  if (!config) {
    return {
      exitCode: 2,
      findings: [
        {
          column: 1,
          file: join(cwd, 'package.json'),
          line: 1,
          message: 'No typecheck script, tsconfig.json, or jsconfig.json was found',
          rule: 'typescript/config-missing',
          severity: 'error',
          tool: 'typescript'
        }
      ]
    }
  }

  const binary = resolveTypeScript(cwd)
  if (!binary) {
    return {
      exitCode: 2,
      findings: [
        {
          column: 1,
          file: join(cwd, config),
          line: 1,
          message: 'TypeScript is not installed in this repository',
          rule: 'typescript/not-installed',
          severity: 'error',
          tool: 'typescript'
        }
      ]
    }
  }

  return parseOutput(
    await runProcess(process.execPath, [binary, '--noEmit', '--pretty', 'false', '-p', config], cwd),
    cwd
  )
}
