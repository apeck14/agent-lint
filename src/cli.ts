#!/usr/bin/env node

import { join } from 'node:path'
import { parseArgs } from 'node:util'

import type { CommandResult, Finding, SharedOptions } from './cli-types.js'
import { runDoctor } from './doctor.js'
import { changedFiles } from './git-files.js'
import { initialize } from './init.js'
import { outputFormat, writeResult } from './output.js'
import { PACKAGE_VERSION } from './package-metadata.js'
import { runNodePackageBin } from './process.js'
import { mergeResults, parseKnip, parseOxfmt, parseOxlint } from './tool-results.js'
import { runTypecheck } from './typecheck.js'

const COMMANDS = new Set(['check', 'fix', 'lint', 'format', 'deadcode', 'init', 'doctor'])
const SHARED_FLAGS = new Set(['format', 'max-diagnostics', 'no-diagnostic-limit', 'help'])
const COMMAND_FLAGS: Record<string, Set<string>> = {
  check: new Set(['changed', 'since', 'typecheck']),
  deadcode: new Set(['production']),
  doctor: new Set(),
  fix: new Set(['changed', 'since']),
  format: new Set(['check', 'write']),
  init: new Set(['dry-run']),
  lint: new Set(['fix'])
}

const HELP = `agent-lint ${PACKAGE_VERSION}

Usage:
  agent-lint check [paths] [--changed | --since <ref>] [--typecheck]
  agent-lint fix [paths] [--changed | --since <ref>]
  agent-lint lint [paths] [--fix]
  agent-lint format [paths] [--check | --write]
  agent-lint deadcode [--production]
  agent-lint init [--dry-run]
  agent-lint doctor

Output:
  --format agent|human|json
  --max-diagnostics <number>       Default: 50
  --no-diagnostic-limit
`

interface CliOptions {
  changed: boolean
  command: string
  dryRun: boolean
  fix: boolean
  help: boolean
  paths: string[]
  production: boolean
  shared: SharedOptions
  since?: string
  typecheck: boolean
  write: boolean
}

function parseCli(argv: string[]): CliOptions {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    return {
      changed: false,
      command: 'help',
      dryRun: false,
      fix: false,
      help: true,
      paths: [],
      production: false,
      shared: { format: 'human', formatExplicit: false, maxDiagnostics: 50, noDiagnosticLimit: false },
      typecheck: false,
      write: false
    }
  }
  if (argv[0] === '--version' || argv[0] === '-V') {
    return {
      changed: false,
      command: 'version',
      dryRun: false,
      fix: false,
      help: false,
      paths: [],
      production: false,
      shared: { format: 'agent', formatExplicit: false, maxDiagnostics: 50, noDiagnosticLimit: false },
      typecheck: false,
      write: false
    }
  }

  const command = argv[0] ?? ''
  if (!COMMANDS.has(command)) throw new Error(`Unknown command: ${command || '(missing)'}`)
  const parsed = parseArgs({
    allowPositionals: true,
    args: argv.slice(1),
    options: {
      changed: { type: 'boolean' },
      check: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      fix: { type: 'boolean' },
      format: { type: 'string' },
      help: { short: 'h', type: 'boolean' },
      'max-diagnostics': { type: 'string' },
      'no-diagnostic-limit': { type: 'boolean' },
      production: { type: 'boolean' },
      since: { type: 'string' },
      typecheck: { type: 'boolean' },
      write: { type: 'boolean' }
    },
    strict: true
  })

  for (const flag of Object.keys(parsed.values)) {
    if (!SHARED_FLAGS.has(flag) && !COMMAND_FLAGS[command]?.has(flag)) {
      throw new Error(`--${flag} is not valid for ${command}`)
    }
  }

  const changed = parsed.values.changed ?? false
  const since = parsed.values.since
  if (since !== undefined && since.trim() === '') throw new Error('--since requires a non-empty Git ref')
  if (['deadcode', 'doctor', 'init'].includes(command) && parsed.positionals.length > 0)
    throw new Error(`${command} does not accept paths`)
  if (changed && since) throw new Error('--changed and --since are mutually exclusive')
  if ((changed || since) && parsed.positionals.length > 0)
    throw new Error('Paths cannot be combined with --changed or --since')
  if (command === 'format' && parsed.values.check && parsed.values.write)
    throw new Error('--check and --write are mutually exclusive')

  const maxDiagnostics = Number(parsed.values['max-diagnostics'] ?? 50)
  if (!Number.isInteger(maxDiagnostics) || maxDiagnostics < 1)
    throw new Error('--max-diagnostics must be a positive integer')

  return {
    changed,
    command,
    dryRun: parsed.values['dry-run'] ?? false,
    fix: parsed.values.fix ?? false,
    help: parsed.values.help ?? false,
    paths: parsed.positionals,
    production: parsed.values.production ?? false,
    shared: {
      format: outputFormat(parsed.values.format),
      formatExplicit: parsed.values.format !== undefined,
      maxDiagnostics,
      noDiagnosticLimit: parsed.values['no-diagnostic-limit'] ?? false
    },
    ...(since ? { since } : {}),
    typecheck: parsed.values.typecheck ?? false,
    write: parsed.values.write ?? false
  }
}

async function selectedPaths(options: CliOptions, cwd: string): Promise<{ notes: string[]; paths: string[] }> {
  if (options.changed || options.since) {
    const paths = await changedFiles(cwd, options.since)
    return { notes: paths.length === 0 ? ['no changed files'] : [], paths }
  }
  return { notes: [], paths: options.paths.length > 0 ? options.paths : ['.'] }
}

async function lint(cwd: string, paths: string[], fix: boolean): Promise<CommandResult> {
  if (paths.length === 0) return { exitCode: 0, findings: [] }
  const args = ['--format', 'json', '--no-error-on-unmatched-pattern', ...(fix ? ['--fix'] : []), '--', ...paths]
  return parseOxlint(await runNodePackageBin('oxlint', 'bin/oxlint', args, cwd), cwd)
}

async function format(cwd: string, paths: string[], write: boolean): Promise<CommandResult> {
  if (paths.length === 0) return { exitCode: 0, findings: [] }
  const args = [write ? '--write' : '--list-different', '--no-error-on-unmatched-pattern', '--', ...paths]
  return parseOxfmt(await runNodePackageBin('oxfmt', 'bin/oxfmt', args, cwd), cwd, write)
}

async function deadcode(cwd: string, production: boolean): Promise<CommandResult> {
  const args = ['--reporter', 'json', '--no-progress', '--exclude', 'cycles', ...(production ? ['--production'] : [])]
  return parseKnip(await runNodePackageBin('knip', 'bin/knip.js', args, cwd), cwd)
}

async function execute(options: CliOptions, cwd: string): Promise<CommandResult> {
  if (options.command === 'init') return initialize(cwd, options.dryRun)
  if (options.command === 'doctor') return runDoctor(cwd)
  if (options.command === 'deadcode') return deadcode(cwd, options.production)

  const selected = await selectedPaths(options, cwd)
  if (options.command === 'lint') return lint(cwd, selected.paths, options.fix)
  if (options.command === 'format') return format(cwd, selected.paths, options.write)
  if (options.command === 'fix') {
    const lintResult = await lint(cwd, selected.paths, true)
    if (lintResult.exitCode === 2) return { ...lintResult, notes: selected.notes }
    const formatResult = await format(cwd, selected.paths, true)
    return { ...mergeResults([lintResult, formatResult]), notes: selected.notes }
  }

  const operations: Array<Promise<CommandResult>> = [
    lint(cwd, selected.paths, false),
    format(cwd, selected.paths, false)
  ]
  if (options.typecheck) operations.push(runTypecheck(cwd))
  return { ...mergeResults(await Promise.all(operations)), notes: selected.notes }
}

function errorResult(cwd: string, message: string, rule = 'agent-lint/execution'): CommandResult {
  const finding: Finding = {
    column: 1,
    file: join(cwd, 'package.json'),
    line: 1,
    message,
    rule,
    severity: 'error',
    tool: 'agent-lint'
  }
  return { exitCode: 2, findings: [finding] }
}

async function main(): Promise<void> {
  const cwd = process.cwd()
  let options: CliOptions

  try {
    options = parseCli(process.argv.slice(2))
  } catch (error) {
    const result = errorResult(cwd, error instanceof Error ? error.message : String(error), 'agent-lint/usage')
    writeResult(
      'agent-lint',
      result,
      { format: 'agent', formatExplicit: false, maxDiagnostics: 50, noDiagnosticLimit: false },
      cwd
    )
    process.exitCode = result.exitCode
    return
  }

  if (options.command === 'help' || options.help) {
    process.stdout.write(HELP)
    return
  }
  if (options.command === 'version') {
    process.stdout.write(`${PACKAGE_VERSION}\n`)
    return
  }

  try {
    const result = await execute(options, cwd)
    writeResult(options.command, result, options.shared, cwd)
    process.exitCode = result.exitCode
  } catch (error) {
    const result = errorResult(cwd, error instanceof Error ? error.message : String(error))
    writeResult(options.command, result, options.shared, cwd)
    process.exitCode = result.exitCode
  }
}

await main()
