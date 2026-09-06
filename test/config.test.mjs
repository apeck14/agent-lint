import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { createOxfmtConfig, createOxlintConfig } from '../dist/index.js'
import { root, temporaryDirectory, write } from './helpers.mjs'

const COMMON_GENERATED_IGNORES = [
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.astro/**',
  '**/.react-router/**',
  '**/.turbo/**',
  '**/.nx/**',
  '**/.vite/**',
  '**/.parcel-cache/**',
  '**/.vercel/**',
  '**/.netlify/**',
  '**/.wrangler/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/*.gen.*',
  '**/__generated__/**',
  '**/next-env.d.ts'
]

test('Oxlint provides strict framework defaults while consumer values win', () => {
  const override = { files: ['special/**'], rules: { eqeqeq: 'off' } }
  const config = createOxlintConfig({
    environment: 'universal',
    framework: 'next',
    ignores: ['custom/**'],
    overrides: [override],
    rules: { eqeqeq: 'off' },
    testRunner: 'both'
  })
  assert.equal(config.categories.correctness, 'error')
  assert.equal(config.options.denyWarnings, true)
  assert.equal(config.rules['import/no-cycle'], 'error')
  assert.equal(config.rules['typescript/no-explicit-any'], 'error')
  assert.deepEqual(config.rules['typescript/ban-ts-comment'], [
    'error',
    {
      minimumDescriptionLength: 10,
      'ts-check': false,
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': 'allow-with-description',
      'ts-nocheck': 'allow-with-description'
    }
  ])
  assert.equal(config.rules['preserve-caught-error'], 'off')
  assert.equal(config.rules['jsx-a11y/no-autofocus'], 'off')
  assert.equal(config.rules['jsx-a11y/control-has-associated-label'], 'off')
  assert.equal(config.rules['jsx-a11y/label-has-associated-control'], 'off')
  assert.equal(config.rules['jsx-a11y/no-static-element-interactions'], 'off')
  assert.equal(config.rules['jsx-a11y/prefer-tag-over-role'], 'off')
  assert.equal(config.env.browser, true)
  assert.equal(config.env.node, true)
  assert.ok(config.plugins.includes('nextjs'))
  assert.ok(config.plugins.includes('jest'))
  assert.ok(config.plugins.includes('vitest'))
  assert.equal(config.rules.eqeqeq, 'off')
  assert.equal(
    config.overrides.find(
      (entry) => entry.files?.includes('**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}') && entry.rules?.['no-var']
    )?.rules?.['no-var'],
    'off'
  )
  assert.equal(config.ignorePatterns.at(-1), 'custom/**')
  assert.deepEqual(config.overrides.at(-1), override)
})

test('Oxfmt preserves the house style while final options win', () => {
  const override = { files: ['legacy/**'], printWidth: 80 }
  const config = createOxfmtConfig({
    format: { printWidth: 100, semi: true },
    ignores: ['custom/**'],
    overrides: [override],
    tailwind: { functions: ['cx'], stylesheet: 'src/styles.css' }
  })
  assert.equal(config.printWidth, 100)
  assert.equal(config.semi, true)
  assert.equal(config.singleQuote, true)
  assert.deepEqual(config.sortImports, { sortSideEffects: false })
  assert.deepEqual(config.sortPackageJson, { sortScripts: false })
  assert.equal(config.ignorePatterns.at(-1), 'custom/**')
  assert.deepEqual(config.overrides, [override])
  assert.deepEqual(config.sortTailwindcss, { functions: ['cx'], stylesheet: 'src/styles.css' })
  assert.ok(config.ignorePatterns.includes('**/npm-shrinkwrap.json'))
  assert.ok(config.ignorePatterns.includes('**/output/**'))
  assert.ok(
    config.ignorePatterns.includes('**/{fixtures,__fixtures__,mocks}/**/*.{json,json5,jsonc,yaml,yml,html,md,mdx}')
  )
  assert.equal(createOxfmtConfig({ tailwind: false }).sortTailwindcss, false)
})

test('lint and formatting ignore common generated repository output', () => {
  const lintIgnores = createOxlintConfig().ignorePatterns
  const formatIgnores = createOxfmtConfig().ignorePatterns

  for (const pattern of COMMON_GENERATED_IGNORES) {
    assert.ok(lintIgnores.includes(pattern), `missing Oxlint ignore: ${pattern}`)
    assert.ok(formatIgnores.includes(pattern), `missing Oxfmt ignore: ${pattern}`)
  }
})

test('Tailwind v3 and v4 projects are detected from repository files', (t) => {
  const entry = pathToFileURL(join(root, 'dist', 'index.js')).href
  const load = (directory) => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { createOxfmtConfig } from '${entry}'; console.log(JSON.stringify(createOxfmtConfig().sortTailwindcss))`
      ],
      { cwd: directory, encoding: 'utf8', windowsHide: true }
    )
    assert.equal(result.status, 0, result.stderr || result.stdout)
    return JSON.parse(result.stdout)
  }

  const versionThree = temporaryDirectory(t)
  write(versionThree, 'package.json', '{"devDependencies":{"tailwindcss":"3.4.0"}}\n')
  write(versionThree, 'tailwind.config.ts', 'export default {}\n')
  assert.equal(load(versionThree).config, 'tailwind.config.ts')

  const versionFour = temporaryDirectory(t)
  write(versionFour, 'package.json', '{"devDependencies":{"tailwindcss":"4.1.0"}}\n')
  write(versionFour, 'src/app/globals.css', "@import './reset.css';\n")
  write(versionFour, 'src/index.css', "@import 'tailwindcss';\n")
  const detected = load(versionFour)
  assert.equal(detected.stylesheet, 'src/index.css')
  assert.deepEqual(detected.functions, ['cn', 'cva', 'clsx', 'twMerge'])
})
