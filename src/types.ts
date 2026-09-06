import type { OxfmtOverrideConfig, Oxfmtrc } from 'oxfmt'
import type { DummyRuleMap, OxlintOverride } from 'oxlint'

export type AgentLintEnvironment = 'node' | 'browser' | 'universal'
export type AgentLintFramework = 'none' | 'react' | 'next'
export type AgentLintTestRunner = 'none' | 'jest' | 'vitest' | 'both'

export interface OxlintPresetOptions {
  environment?: AgentLintEnvironment
  framework?: AgentLintFramework
  testRunner?: AgentLintTestRunner
  ignores?: string[]
  rules?: DummyRuleMap
  overrides?: OxlintOverride[]
}

export type TailwindPreset =
  | boolean
  | {
      config?: string
      functions?: string[]
      stylesheet?: string
    }

export interface OxfmtPresetOptions {
  ignores?: string[]
  overrides?: OxfmtOverrideConfig[]
  tailwind?: TailwindPreset
  format?: Partial<Omit<Oxfmtrc, 'ignorePatterns' | 'overrides' | 'sortTailwindcss'>>
}
