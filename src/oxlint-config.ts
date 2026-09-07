import type { DummyRuleMap, OxlintConfig, OxlintEnv, OxlintOverride } from 'oxlint'

import { COMMON_IGNORE_PATTERNS } from './ignore-patterns.js'
import type { OxlintPresetOptions } from './types.js'

const TEST_FILES = [
  '**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/{test,tests}/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/fixtures/**'
]

const CONFIG_FILES = ['**/*.config.{js,mjs,cjs,ts,mts,cts}', '**/scripts/**', '**/generated/**', '**/*.generated.*']

const BASE_RULES: DummyRuleMap = {
  eqeqeq: 'error',
  'no-debugger': 'error',
  'no-empty': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-promise-executor-return': 'error',
  'no-var': 'error',
  'no-unused-vars': [
    'error',
    {
      args: 'after-used',
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }
  ],
  'import/no-cycle': 'error',
  'import/default': 'error',
  'import/no-duplicates': 'error',
  'import/export': 'error',
  'import/named': 'error',
  'import/namespace': 'error',
  'import/no-self-import': 'error',
  'promise/no-multiple-resolved': 'error',
  'promise/no-new-statics': 'error',
  'promise/no-return-in-finally': 'error',
  'promise/param-names': 'error',
  'promise/valid-params': 'error',
  'promise/catch-or-return': 'error',
  'prefer-const': 'error',
  // Its fixer emits Error `cause`, which fails typechecking for valid pre-ES2022 targets.
  'preserve-caught-error': 'off',
  'typescript/ban-ts-comment': [
    'error',
    {
      minimumDescriptionLength: 10,
      'ts-check': false,
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': 'allow-with-description',
      'ts-nocheck': 'allow-with-description'
    }
  ],
  'typescript/no-explicit-any': 'error',
  'typescript/no-non-null-assertion': 'error',
  'typescript/no-unused-vars': [
    'error',
    {
      args: 'after-used',
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }
  ],
  'unicorn/no-abusive-eslint-disable': 'error',
  'unicorn/no-useless-fallback-in-spread': 'off',
  'unicorn/no-useless-spread': 'off',
  'unicorn/prefer-node-protocol': 'error',
  'unicorn/prefer-string-starts-ends-with': 'off'
}

const TEST_RULES: DummyRuleMap = {
  'jest/expect-expect': 'off',
  'jest/no-conditional-expect': 'off',
  'jest/no-commented-out-tests': 'error',
  'jest/no-disabled-tests': 'error',
  'jest/no-focused-tests': 'error',
  'jest/no-identical-title': 'error',
  'jest/require-to-throw-message': 'off',
  'jest/valid-describe-callback': 'error',
  'jest/valid-expect': 'error',
  'jest/valid-expect-in-promise': 'error',
  'jest/valid-title': 'error',
  'vitest/expect-expect': 'off',
  'vitest/no-conditional-expect': 'off',
  'vitest/no-commented-out-tests': 'error',
  'vitest/no-disabled-tests': 'error',
  'vitest/no-focused-tests': 'error',
  'vitest/no-identical-title': 'error',
  'vitest/require-mock-type-parameters': 'off',
  'vitest/require-awaited-expect-poll': 'error',
  'vitest/require-to-throw-message': 'off',
  'vitest/valid-describe-callback': 'error',
  'vitest/valid-expect': 'error',
  'vitest/valid-expect-in-promise': 'error',
  'vitest/valid-title': 'error'
}

const REACT_RULES: DummyRuleMap = {
  'jsx-a11y/alt-text': 'error',
  'jsx-a11y/anchor-has-content': 'error',
  'jsx-a11y/aria-props': 'error',
  'jsx-a11y/aria-role': 'error',
  'jsx-a11y/click-events-have-key-events': 'error',
  // These do not understand common compound/custom components and routinely flag correctly labelled controls.
  'jsx-a11y/control-has-associated-label': 'off',
  'jsx-a11y/label-has-associated-control': 'off',
  'jsx-a11y/no-autofocus': 'off',
  'jsx-a11y/no-noninteractive-tabindex': 'off',
  'jsx-a11y/no-static-element-interactions': 'off',
  'jsx-a11y/prefer-tag-over-role': 'off',
  'react/jsx-key': 'error',
  'react/exhaustive-deps': 'error',
  'react/rules-of-hooks': 'error',
  'react/error-boundaries': 'error',
  'react/globals': 'error',
  'react/immutability': 'error',
  'react/no-danger-with-children': 'error',
  'react/no-direct-mutation-state': 'error',
  'react/no-unknown-property': 'error',
  'react/purity': 'error',
  'react/refs': 'error',
  'react/set-state-in-render': 'error',
  'react/static-components': 'error',
  'react/use-memo': 'error',
  'react/void-use-memo': 'error'
}

const NEXT_RULES: DummyRuleMap = {
  'nextjs/google-font-display': 'error',
  'nextjs/google-font-preconnect': 'error',
  'nextjs/no-head-element': 'error',
  'nextjs/no-html-link-for-pages': 'error',
  'nextjs/no-img-element': 'error',
  'nextjs/no-page-custom-font': 'error',
  'nextjs/no-sync-scripts': 'error'
}

function environments(environment: NonNullable<OxlintPresetOptions['environment']>): OxlintEnv {
  return {
    browser: environment !== 'node',
    es2024: true,
    node: environment !== 'browser'
  }
}

function plugins(options: OxlintPresetOptions): NonNullable<OxlintConfig['plugins']> {
  const enabled = new Set<NonNullable<OxlintConfig['plugins']>[number]>([
    'oxc',
    'typescript',
    'unicorn',
    'import',
    'promise'
  ])

  if (options.framework === 'react' || options.framework === 'next') {
    enabled.add('react')
    enabled.add('jsx-a11y')
  }

  if (options.framework === 'next') enabled.add('nextjs')
  if (options.testRunner === 'jest' || options.testRunner === 'both') enabled.add('jest')
  if (options.testRunner === 'vitest' || options.testRunner === 'both') enabled.add('vitest')

  return [...enabled]
}

function builtInOverrides(options: OxlintPresetOptions): OxlintOverride[] {
  const overrides: OxlintOverride[] = [
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      rules: {
        'no-undef': 'off',
        'no-unused-vars': 'off'
      }
    },
    {
      files: [...TEST_FILES, ...CONFIG_FILES],
      rules: {
        'typescript/ban-ts-comment': 'off',
        'typescript/no-explicit-any': 'off',
        'typescript/no-non-null-assertion': 'off'
      }
    },
    {
      files: TEST_FILES,
      rules: {
        // Jest mock factories sometimes intentionally rely on `var` hoisting.
        'no-var': 'off'
      }
    },
    {
      env: { node: true },
      files: CONFIG_FILES
    }
  ]

  if (options.framework === 'react' || options.framework === 'next') {
    overrides.push({
      files: TEST_FILES,
      rules: {
        'jsx-a11y/click-events-have-key-events': 'off',
        'react/no-this-in-sfc': 'off'
      }
    })
  }

  if (options.framework === 'next') {
    overrides.push({ files: TEST_FILES, rules: { 'nextjs/no-html-link-for-pages': 'off' } })
  }

  if (options.testRunner !== 'none') {
    overrides.push({ files: TEST_FILES, rules: TEST_RULES })
  }

  return overrides
}

export function createOxlintConfig(options: OxlintPresetOptions = {}): OxlintConfig {
  const normalized: OxlintPresetOptions = {
    environment: 'node',
    framework: 'none',
    testRunner: 'none',
    ...options
  }

  return {
    categories: {
      correctness: 'error'
    },
    env: environments(normalized.environment ?? 'node'),
    ignorePatterns: [...COMMON_IGNORE_PATTERNS, ...(normalized.ignores ?? [])],
    options: {
      denyWarnings: true,
      reportUnusedDisableDirectives: 'error'
    },
    overrides: [...builtInOverrides(normalized), ...(normalized.overrides ?? [])],
    plugins: plugins(normalized),
    rules: {
      ...BASE_RULES,
      ...(normalized.framework === 'react' || normalized.framework === 'next' ? REACT_RULES : {}),
      ...(normalized.framework === 'next' ? NEXT_RULES : {}),
      ...(normalized.rules ?? {})
    }
  }
}
