export type OutputFormat = 'agent' | 'human' | 'json'

export interface Finding {
  column: number
  file: string
  line: number
  message: string
  rule: string
  severity: 'error' | 'warning'
  tool: 'agent-lint' | 'oxlint' | 'oxfmt' | 'typescript' | 'knip' | 'doctor' | 'init'
}

export interface CommandResult {
  exitCode: 0 | 1 | 2
  findings: Finding[]
  notes?: string[]
}

export interface SharedOptions {
  format: OutputFormat
  formatExplicit: boolean
  maxDiagnostics: number
  noDiagnosticLimit: boolean
}

export interface RunResult {
  error?: Error
  exitCode: number
  stderr: string
  stdout: string
}
