import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { runProcess } from './process.js'
import { isGitRepository } from './project.js'

function splitNull(value: string): string[] {
  return value.split('\0').filter(Boolean)
}

async function gitNames(cwd: string, args: string[]): Promise<string[]> {
  const result = await runProcess('git', args, cwd)
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Git command failed: git ${args.join(' ')}`)
  return splitNull(result.stdout)
}

export async function changedFiles(cwd: string, since?: string): Promise<string[]> {
  if (!(await isGitRepository(cwd))) throw new Error('--changed and --since require a Git repository')

  const groups: string[][] = []
  if (since) {
    const mergeBase = await runProcess('git', ['merge-base', since, 'HEAD'], cwd)
    if (mergeBase.exitCode !== 0 || !mergeBase.stdout.trim()) {
      throw new Error(mergeBase.stderr.trim() || `Could not find a merge base for ${since}`)
    }
    groups.push(
      await gitNames(cwd, ['diff', '--name-only', '--diff-filter=ACMR', '-z', mergeBase.stdout.trim(), 'HEAD'])
    )
  }

  groups.push(await gitNames(cwd, ['diff', '--name-only', '--diff-filter=ACMR', '-z']))
  groups.push(await gitNames(cwd, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']))
  groups.push(await gitNames(cwd, ['ls-files', '--others', '--exclude-standard', '-z']))

  return [...new Set(groups.flat())]
    .filter((path) => existsSync(resolve(cwd, path)))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}
