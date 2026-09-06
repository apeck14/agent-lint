import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, parse } from 'node:path'

import type { RunResult } from './cli-types.js'

export function runProcess(command: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const isWindowsCommand = process.platform === 'win32' && /^(?:bun|bunx|npm|npx|pnpm|yarn)$/.test(command)
    const executable = isWindowsCommand ? (process.env.ComSpec ?? 'cmd.exe') : command
    const processArgs = isWindowsCommand ? ['/d', '/s', '/c', `${command}.cmd`, ...args] : args
    const child = spawn(executable, processArgs, {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1'
      },
      shell: false,
      windowsHide: true
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => {
      resolve({ error, exitCode: 2, stderr: '', stdout: '' })
    })
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 2,
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8')
      })
    })
  })
}

export function resolvePackageBin(packageName: string, relativeBin: string): string {
  const fromPackage = createRequire(import.meta.url)

  function packageRoot(require: NodeJS.Require): string {
    try {
      return dirname(require.resolve(`${packageName}/package.json`))
    } catch {
      let directory = dirname(require.resolve(packageName))
      const root = parse(directory).root
      while (directory !== root) {
        const manifest = join(directory, 'package.json')
        if (existsSync(manifest)) {
          try {
            const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }
            if (parsed.name === packageName) return directory
          } catch {
            // Keep walking; the package resolver already proved the module exists.
          }
        }
        directory = dirname(directory)
      }
      throw new Error(`Could not locate the ${packageName} package root`)
    }
  }

  return join(packageRoot(fromPackage), relativeBin)
}

export function runNodePackageBin(
  packageName: string,
  relativeBin: string,
  args: string[],
  cwd: string
): Promise<RunResult> {
  return runProcess(process.execPath, [resolvePackageBin(packageName, relativeBin), ...args], cwd)
}
