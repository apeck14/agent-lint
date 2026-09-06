import { isAbsolute, join } from 'node:path'

import type { CommandResult, Finding, RunResult } from './cli-types.js'

interface OxlintDiagnostic {
  code?: string
  filename?: string
  labels?: Array<{ span?: { column?: number; line?: number } }>
  message?: string
  severity?: string
}

interface OxlintJson {
  diagnostics?: OxlintDiagnostic[]
}

function absolute(cwd: string, path: string | undefined): string {
  if (!path) return join(cwd, 'package.json')
  return isAbsolute(path) ? path : join(cwd, path)
}

function oxlintRule(code: string | undefined): string {
  if (!code) return 'oxlint'
  const match = /^([^()]+)\(([^()]+)\)$/.exec(code)
  if (!match) return code
  const plugin = match[1] === 'typescript-eslint' ? 'typescript' : match[1]
  return `${plugin}/${match[2]}`
}

function executionFailure(tool: Finding['tool'], cwd: string, result: RunResult): CommandResult {
  const message =
    result.error?.message ||
    result.stderr.trim() ||
    result.stdout.trim() ||
    `${tool} exited with code ${result.exitCode}`
  return {
    exitCode: 2,
    findings: [
      {
        column: 1,
        file: join(cwd, 'package.json'),
        line: 1,
        message,
        rule: `${tool}/execution`,
        severity: 'error',
        tool
      }
    ]
  }
}

export function parseOxlint(result: RunResult, cwd: string): CommandResult {
  let parsed: OxlintJson
  try {
    parsed = JSON.parse(result.stdout) as OxlintJson
  } catch {
    return result.exitCode === 0 ? { exitCode: 0, findings: [] } : executionFailure('oxlint', cwd, result)
  }

  const findings: Finding[] = (parsed.diagnostics ?? []).map((diagnostic) => {
    const span = diagnostic.labels?.find((label) => label.span)?.span
    return {
      column: span?.column ?? 1,
      file: absolute(cwd, diagnostic.filename),
      line: span?.line ?? 1,
      message: diagnostic.message ?? 'Unknown lint violation',
      rule: oxlintRule(diagnostic.code),
      severity: diagnostic.severity === 'warning' ? 'warning' : 'error',
      tool: 'oxlint'
    }
  })

  if (result.exitCode !== 0 && findings.length === 0) return executionFailure('oxlint', cwd, result)
  return { exitCode: findings.length > 0 ? 1 : 0, findings }
}

export function parseOxfmt(result: RunResult, cwd: string, write: boolean): CommandResult {
  if (write) {
    return result.exitCode === 0 ? { exitCode: 0, findings: [] } : executionFailure('oxfmt', cwd, result)
  }

  const files = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.startsWith('Checking ') &&
        !line.startsWith('Finished in ') &&
        !line.startsWith('Found ') &&
        !line.includes(' files checked')
    )
  const findings: Finding[] = files.map((file) => ({
    column: 1,
    file: absolute(cwd, file),
    line: 1,
    message: 'File is not formatted',
    rule: 'format',
    severity: 'error',
    tool: 'oxfmt'
  }))

  if (result.exitCode !== 0 && findings.length === 0) return executionFailure('oxfmt', cwd, result)
  return { exitCode: findings.length > 0 ? 1 : 0, findings }
}

function knipFindings(value: unknown, cwd: string): Finding[] {
  if (!value || typeof value !== 'object') return []
  const issues = (value as { issues?: unknown }).issues
  if (!Array.isArray(issues)) return []

  const findings: Finding[] = []
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') continue
    const record = issue as Record<string, unknown>
    const file = typeof record.file === 'string' ? record.file : 'package.json'
    for (const [issueType, entries] of Object.entries(record)) {
      if (issueType === 'file' || !Array.isArray(entries)) continue
      for (const entry of entries) {
        const detail = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : undefined
        const name = typeof entry === 'string' ? entry : typeof detail?.name === 'string' ? detail.name : issueType
        findings.push({
          column: typeof detail?.col === 'number' ? detail.col : 1,
          file: absolute(cwd, file),
          line: typeof detail?.line === 'number' ? detail.line : 1,
          message: `${issueType}: ${name}`,
          rule: `knip/${issueType}`,
          severity: 'error',
          tool: 'knip'
        })
      }
    }
  }
  return findings
}

export function parseKnip(result: RunResult, cwd: string): CommandResult {
  if (result.exitCode === 0 && !result.stdout.trim()) return { exitCode: 0, findings: [] }

  try {
    const parsed = JSON.parse(result.stdout) as unknown
    const findings = knipFindings(parsed, cwd)
    if (result.exitCode !== 0 && findings.length === 0) return executionFailure('knip', cwd, result)
    return { exitCode: findings.length > 0 ? 1 : 0, findings }
  } catch {
    if (result.exitCode === 0) return { exitCode: 0, findings: [] }
    return executionFailure('knip', cwd, result)
  }
}

export function mergeResults(results: CommandResult[]): CommandResult {
  const exitCode = results.some((result) => result.exitCode === 2)
    ? 2
    : results.some((result) => result.exitCode === 1)
      ? 1
      : 0
  return {
    exitCode,
    findings: results.flatMap((result) => result.findings),
    notes: results.flatMap((result) => result.notes ?? [])
  }
}
