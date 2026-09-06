# @apehk/agent-lint

Opinionated, agent-first checks for JavaScript and TypeScript repositories. It combines Oxlint, Oxfmt, and on-demand
Knip analysis behind one deterministic CLI and two typed configuration factories.

The defaults are intentionally broad and the public surface is intentionally small: most repositories should initialize
the package once and never need to tune it.

## Requirements

- Node.js 22.18 or newer
- npm, pnpm, Yarn, or Bun

## Set up a repository

Install the package exactly, then run the non-interactive initializer:

```sh
pnpm add --save-dev --save-exact @apehk/agent-lint@1.0.0
pnpm exec agent-lint init
```

The initializer detects the package manager, runtime, React or Next.js, and Jest or Vitest. It creates typed Oxlint and
Oxfmt configuration, adds conventional scripts, and appends a short managed block to `AGENTS.md`. Existing custom files
and scripts are preserved. Preview every proposed change with:

```sh
pnpm exec agent-lint init --dry-run
```

When invoked through a one-off package runner, `init` installs this package as an exact development dependency.

## Everyday commands

```sh
agent-lint check                       # lint and format concurrently
agent-lint check --changed             # staged, unstaged, renamed, and untracked files
agent-lint check --since origin/main   # branch changes plus current working-tree changes
agent-lint check --typecheck           # also run the repository's local TypeScript check
agent-lint fix --changed               # safe Oxlint fixes, then deterministic formatting
agent-lint lint [paths] [--fix]
agent-lint format [paths] [--check | --write]
agent-lint deadcode [--production]
agent-lint doctor
```

Paths cannot be combined with `--changed` or `--since`. Formatting defaults to check mode. Dead-code analysis is always
read-only and never exposes Knip's destructive fix mode.

Exit status is `0` when clean, `1` for findings, and `2` for configuration or execution failures.

## Output designed for agents

Agent output is the default and contains one sortable line per finding:

```text
src/example.ts:4:7 [typescript/no-explicit-any] Unexpected any. Specify a different type.
```

Only 50 diagnostics are printed by default. The truncation line includes the exact command to rerun without a limit.
Use `--format human`, `--format json`, `--max-diagnostics <n>`, or `--no-diagnostic-limit` when needed. GitHub Actions
annotations are automatic unless `--format` is explicitly provided. Clean agent output is one summary line.

## Typed configuration

```ts
// oxlint.config.ts
import { createOxlintConfig } from '@apehk/agent-lint'

export default createOxlintConfig({
  environment: 'universal',
  framework: 'next',
  testRunner: 'jest',
  ignores: ['public/vendor/**'],
  rules: { 'typescript/no-explicit-any': 'off' },
  overrides: [{ files: ['scripts/**'], rules: { 'no-console': 'off' } }]
})
```

```ts
// oxfmt.config.ts
import { createOxfmtConfig } from '@apehk/agent-lint'

export default createOxfmtConfig({
  ignores: ['public/generated/**'],
  tailwind: { stylesheet: 'src/styles.css' },
  overrides: [{ files: ['legacy/**'], printWidth: 100 }],
  format: { printWidth: 110 }
})
```

Consumer rules and formatter options win over package defaults. Ignores and file overrides are additive. Set
`tailwind: false` to disable Tailwind sorting explicitly.

## Defaults

- Oxlint correctness rules are errors, never warnings.
- Native Oxc, TypeScript, Unicorn, Import, and Promise rules are enabled.
- Full-depth circular imports, export integrity, duplicate imports, self-imports, stale disables, debugger, eval, dynamic
  functions, and non-strict equality are rejected.
- `_`-prefixed variables and parameters are intentional.
- Production TypeScript rejects explicit `any` and unexplained suppression comments; tests, fixtures, generated files,
  and tool configuration relax those two policies.
- React enables hooks and accessibility correctness. Next.js adds native Next checks. Jest and Vitest reject focused or
  disabled tests and validate assertions, titles, and callbacks.
- Formatting uses 120 columns, two spaces, no semicolons, single quotes including JSX, no trailing commas, and LF.
- Imports and `package.json` are sorted deterministically while side-effect import order and script order are preserved.
- Tailwind v3 configuration and v4 stylesheets are detected, including `cn`, `cva`, `clsx`, and `twMerge` helpers.

Oxfmt covers JavaScript, TypeScript, JSON, JSONC, CSS, SCSS, Less, Markdown, YAML, HTML, Vue, Svelte, Astro, GraphQL, and
other supported text formats without separate plugins.

## Type checking and dead code

`check --typecheck` runs an existing non-recursive `typecheck` script. Otherwise it runs the repository's installed
TypeScript compiler with `--noEmit` against `tsconfig.json` or `jsconfig.json`. It never substitutes a bundled compiler.

`deadcode` respects native Knip configuration and `.gitignore`, omits duplicate cycle reporting, and shares the same
diagnostic cap as other commands.

## Why this shape

Oxc provides a native coding-agent output format and recommends tight lint/fix feedback loops. Empirical work on
repository instructions suggests that oversized always-loaded instruction files can add reasoning cost without reliably
improving outcomes, so initialization writes only operational commands. Knip stays on demand because structural analysis
is valuable after dependency or module changes but unnecessary in every edit loop.

- [Oxc coding-agent guidance](https://oxc.rs/docs/guide/usage/coding-agents.html)
- [Oxfmt configuration](https://oxc.rs/docs/guide/usage/formatter/config)
- [Oxfmt language support](https://oxc.rs/docs/guide/usage/formatter/language-support)
- [Knip analysis model](https://knip.dev/explanations/how-knip-works)
- [AGENTS.md evaluation](https://arxiv.org/abs/2602.11988)
- [Configuration-smell study](https://arxiv.org/abs/2606.15828)

## Security and side effects

The package has no install, postinstall, prepare, or other consumer-mutating lifecycle scripts. `doctor` is offline and
read-only. It reports operational setup problems separately from migration advice and warns about tracked environment or
private-key-shaped files without reading their contents.

## License

ISC
