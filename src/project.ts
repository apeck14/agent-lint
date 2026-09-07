import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runProcess } from './process.js'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  name?: string
  packageManager?: string
  peerDependencies?: Record<string, string>
  scripts?: Record<string, string>
  type?: string
  version?: string
  [key: string]: unknown
}

const LOCKFILES: Record<PackageManager, string[]> = {
  bun: ['bun.lock', 'bun.lockb'],
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock']
}

export function readPackageJson(cwd: string): PackageJson {
  const path = join(cwd, 'package.json')
  if (!existsSync(path)) throw new Error(`No package.json found in ${cwd}`)

  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('the root value must be an object')
    }
    return value as PackageJson
  } catch (error) {
    throw new Error(`Could not parse package.json: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }
}

export function detectPackageManager(cwd: string, packageJson = readPackageJson(cwd)): PackageManager {
  const matches = (Object.entries(LOCKFILES) as [PackageManager, string[]][]).filter(([, files]) =>
    files.some((file) => existsSync(join(cwd, file)))
  )

  if (matches.length > 1) {
    throw new Error(`Multiple package-manager lockfiles found: ${matches.map(([name]) => name).join(', ')}`)
  }

  if (packageJson.packageManager) {
    const name = packageJson.packageManager.split('@')[0]
    if (name === 'pnpm' || name === 'npm' || name === 'yarn' || name === 'bun') {
      const lockfileManager = matches[0]?.[0]
      if (lockfileManager && lockfileManager !== name) {
        throw new Error(`packageManager declares ${name}, but the repository has a ${lockfileManager} lockfile`)
      }
      return name
    }
    throw new Error(`Unsupported package manager: ${packageJson.packageManager}`)
  }

  return matches[0]?.[0] ?? 'npm'
}

export function packageManagerRunArgs(manager: PackageManager, script: string): [string, string[]] {
  return [manager, ['run', script]]
}

export function packageManagerAddArgs(manager: PackageManager, specifier: string): [string, string[]] {
  if (manager === 'npm') return ['npm', ['install', '--save-dev', '--save-exact', specifier]]
  if (manager === 'yarn') return ['yarn', ['add', '--dev', '--exact', specifier]]
  if (manager === 'bun') return ['bun', ['add', '--dev', '--exact', specifier]]
  return ['pnpm', ['add', '--save-dev', '--save-exact', specifier]]
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  const result = await runProcess('git', ['rev-parse', '--is-inside-work-tree'], cwd)
  return result.exitCode === 0 && result.stdout.trim() === 'true'
}
