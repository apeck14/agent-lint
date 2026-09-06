import { isAbsolute, relative } from 'node:path'

import type { CommandResult, Finding, OutputFormat, SharedOptions } from './cli-types.js'

function normalizedFile(cwd: string, file: string): string {
  const path = isAbsolute(file) ? relative(cwd, file) || file : file
  return path.replaceAll('\\', '/')
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (left, right) =>
      compareText(left.file, right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      compareText(left.rule, right.rule) ||
      compareText(left.message, right.message)
  )
}

function agentLine(finding: Finding): string {
  return `${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message.replaceAll(/\s+/g, ' ').trim()}`
}

function githubLine(finding: Finding): string {
  const command = finding.severity === 'warning' ? 'warning' : 'error'
  const escaped = finding.message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  return `::${command} file=${finding.file},line=${finding.line},col=${finding.column},title=${finding.rule}::${escaped}`
}

function rerunCommand(): string {
  const args = process.argv.slice(2).filter((value) => value !== '--no-diagnostic-limit')
  const rendered = args.map((value) => (/^[\w./:@=-]+$/.test(value) ? value : JSON.stringify(value)))
  return `agent-lint ${[...rendered, '--no-diagnostic-limit'].join(' ')}`
}

export function writeResult(
  command: string,
  result: CommandResult,
  options: SharedOptions,
  cwd: string,
  githubActions = process.env.GITHUB_ACTIONS === 'true'
): void {
  const normalized = sortFindings(result.findings).map((finding) => ({
    ...finding,
    file: normalizedFile(cwd, finding.file)
  }))
  const limit = options.noDiagnosticLimit ? normalized.length : options.maxDiagnostics
  const shown = normalized.slice(0, limit)
  const omitted = normalized.length - shown.length

  if (options.format === 'json') {
    process.stdout.write(
      `${JSON.stringify({
        command,
        exitCode: result.exitCode,
        findings: shown,
        notes: result.notes ?? [],
        omitted,
        ...(omitted > 0 ? { rerun: rerunCommand() } : {}),
        total: normalized.length
      })}\n`
    )
    return
  }

  if (githubActions && !options.formatExplicit) {
    for (const finding of shown) process.stdout.write(`${githubLine(finding)}\n`)
  } else if (options.format === 'human') {
    if (shown.length > 0)
      process.stdout.write(`${command}: ${normalized.length} finding${normalized.length === 1 ? '' : 's'}\n`)
    for (const finding of shown) {
      process.stdout.write(`${agentLine(finding)} (${finding.severity}, ${finding.tool})\n`)
    }
  } else {
    for (const finding of shown) process.stdout.write(`${agentLine(finding)}\n`)
  }

  for (const note of result.notes ?? []) process.stdout.write(`${note}\n`)
  if (omitted > 0) {
    process.stdout.write(`... ${omitted} more; rerun: ${rerunCommand()}\n`)
  }
  if (shown.length === 0 && (result.notes?.length ?? 0) === 0) {
    process.stdout.write(`${command}: clean\n`)
  }
}

export function outputFormat(value: string | undefined): OutputFormat {
  if (value === undefined) return 'agent'
  if (value === 'agent' || value === 'human' || value === 'json') return value
  throw new Error(`Invalid output format: ${value}. Expected agent, human, or json.`)
}
