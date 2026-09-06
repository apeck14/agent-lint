import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { createOxfmtConfig, createOxlintConfig } from '../dist/index.js'
import { root, temporaryDirectory, write } from './helpers.mjs'

test('Oxlint presets cover every environment, framework, and test runner', () => {
  for (const environment of ['node', 'browser', 'universal']) {
    for (const framework of ['none', 'react', 'next']) {
      for (const testRunner of ['none', 'jest', 'vitest', 'both']) {
        const config = createOxlintConfig({ environment, framework, testRunner })
        assert.equal(config.categories.correctness, 'error')
        assert.equal(config.options.denyWarnings, true)
        assert.equal(config.rules['import/no-cycle'], 'error')
        assert.equal(config.env.node, environment !== 'browser')
        assert.equal(config.env.browser, environment !== 'node')
        assert.equal(config.plugins.includes('react'), framework !== 'none')
        assert.equal(config.plugins.includes('nextjs'), framework === 'next')
        assert.equal(config.plugins.includes('jest'), testRunner === 'jest' || testRunner === 'both')
        assert.equal(config.plugins.includes('vitest'), testRunner === 'vitest' || testRunner === 'both')
      }
    }
  }
})

test('consumer Oxlint rules win and ignores and overrides append', () => {
  const override = { files: ['special/**'], rules: { eqeqeq: 'off' } }
  const config = createOxlintConfig({ ignores: ['custom/**'], overrides: [override], rules: { eqeqeq: 'off' } })
  assert.equal(config.rules.eqeqeq, 'off')
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
})

test('Tailwind sorting can be explicitly disabled', () => {
  assert.equal(createOxfmtConfig({ tailwind: false }).sortTailwindcss, false)
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
  write(versionFour, 'src/app/globals.css', "@import 'tailwindcss';\n")
  const detected = load(versionFour)
  assert.equal(detected.stylesheet, 'src/app/globals.css')
  assert.deepEqual(detected.functions, ['cn', 'cva', 'clsx', 'twMerge'])
})
