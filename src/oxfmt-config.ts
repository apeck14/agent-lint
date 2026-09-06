import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Oxfmtrc, SortTailwindcssUserConfig } from 'oxfmt'

import { COMMON_IGNORE_PATTERNS, FORMAT_ONLY_IGNORE_PATTERNS } from './ignore-patterns.js'
import type { OxfmtPresetOptions, TailwindPreset } from './types.js'

const TAILWIND_CONFIGS = [
  'tailwind.config.ts',
  'tailwind.config.mts',
  'tailwind.config.js',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
  'tailwind.config.cts'
]

const TAILWIND_STYLESHEETS = [
  'src/app/globals.css',
  'app/globals.css',
  'src/styles/globals.css',
  'styles/globals.css',
  'src/globals.css',
  'src/styles.css',
  'src/index.css',
  'src/app.css',
  'globals.css',
  'index.css',
  'app.css'
]

const TAILWIND_FUNCTIONS = ['cn', 'cva', 'clsx', 'twMerge']

function isTailwindProject(cwd: string): boolean {
  const packagePath = join(cwd, 'package.json')
  if (!existsSync(packagePath)) return false

  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >
    return ['dependencies', 'devDependencies', 'peerDependencies'].some((field) =>
      Object.keys(packageJson[field] ?? {}).some((name) => name === 'tailwindcss' || name.startsWith('@tailwindcss/'))
    )
  } catch {
    return false
  }
}

function detectedTailwind(cwd: string): SortTailwindcssUserConfig {
  if (!isTailwindProject(cwd)) return false

  const config = TAILWIND_CONFIGS.find((path) => existsSync(join(cwd, path)))
  const stylesheet = TAILWIND_STYLESHEETS.find((path) => {
    const absolute = join(cwd, path)
    if (!existsSync(absolute)) return false
    const content = readFileSync(absolute, 'utf8')
    return /@import\s+['"]tailwindcss(?:\/[^'"]*)?['"]|@(?:tailwind|theme|utility|custom-variant)\b/.test(content)
  })

  return {
    ...(config ? { config } : {}),
    functions: TAILWIND_FUNCTIONS,
    ...(stylesheet ? { stylesheet } : {})
  }
}

function tailwindConfig(value: TailwindPreset | undefined, cwd: string): SortTailwindcssUserConfig {
  if (value === false) return false
  if (value === undefined) return detectedTailwind(cwd)
  if (value === true) return { functions: TAILWIND_FUNCTIONS }
  return {
    functions: value.functions ?? TAILWIND_FUNCTIONS,
    ...(value.config ? { config: value.config } : {}),
    ...(value.stylesheet ? { stylesheet: value.stylesheet } : {})
  }
}

export function createOxfmtConfig(options: OxfmtPresetOptions = {}): Oxfmtrc {
  const cwd = process.cwd()

  return {
    endOfLine: 'lf',
    ignorePatterns: [...COMMON_IGNORE_PATTERNS, ...FORMAT_ONLY_IGNORE_PATTERNS, ...(options.ignores ?? [])],
    jsxSingleQuote: true,
    printWidth: 120,
    semi: false,
    singleQuote: true,
    sortImports: { sortSideEffects: false },
    sortPackageJson: { sortScripts: false },
    sortTailwindcss: tailwindConfig(options.tailwind, cwd),
    tabWidth: 2,
    trailingComma: 'none',
    useTabs: false,
    ...(options.format ?? {}),
    overrides: options.overrides ?? []
  }
}
