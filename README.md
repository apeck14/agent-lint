# @apeck14/agent-lint

Opinionated, agent-first checks for JavaScript and TypeScript repositories. One small package combines Oxlint, Oxfmt,
and on-demand Knip analysis with deterministic output and safe defaults.

It is optimized for TypeScript-heavy services, workers, React, and Next.js, while remaining useful for ordinary
JavaScript, CommonJS, browser, and monorepo projects.

## Why it works well for agentic coding

- **Fast feedback:** native linting and formatting run concurrently, keeping edit-check loops short.
- **Low-token diagnostics:** stable one-line findings are sorted and capped at 50 by default, with no code frames or
  decoration.
- **Agent-focused guardrails:** catches unsafe assertions, unexplained suppressions, unhandled promises, unresolved or
  cyclic imports, stale disables, broken React patterns, and focused or disabled tests.
- **Deterministic output:** one formatter covers code, JSON, CSS, Markdown, YAML, HTML, and related files; imports,
  package metadata, and Tailwind classes are sorted consistently.
- **Safe automation:** `fix` applies only safe Oxlint fixes before formatting. Dangerous fixes, destructive Knip modes,
  hooks, and install-time scripts are not exposed.
- **No constant analysis tax:** typechecking is opt-in at the CLI and added automatically to suitable generated project
  scripts; structural dead-code analysis runs only when useful.
- **Minimal agent context:** initialization writes a short operational block instead of a large policy document.

## Quick start

Requires Node.js 22.18 or newer. npm, pnpm, Yarn, and Bun repositories are supported.

```sh
npx --yes @apeck14/agent-lint@1.0.0 init
```

The non-interactive initializer detects the package manager, runtime, TypeScript, framework, and test runner. It installs
an exact development dependency, creates typed Oxlint and Oxfmt configuration, adds package scripts, updates a managed
`AGENTS.md` block, adds LF normalization when `.gitattributes` is absent, and creates a one-line `CLAUDE.md` import when
absent. Existing custom files, script collisions, and competing tools are preserved and reported.

Preview the exact changes without writing:

```sh
npx --yes @apeck14/agent-lint@1.0.0 init --dry-run
```

## Agent workflow

The generated instructions use the detected package manager. With pnpm, the normal loop is:

```sh
pnpm fix --changed
pnpm check
pnpm deadcode # after adding, moving, or removing modules or dependencies
```

`--changed` includes the entire working tree. If unrelated work is present, pass only the files the agent edited. The
generated instructions also tell agents to fix causes instead of weakening rules or adding ignores.

## Commands

Invoke the CLI through the package manager for options not covered by generated scripts:

- `check [paths] [--changed | --since <ref>] [--typecheck]`: lint and format concurrently, optionally with typechecking.
- `fix [paths] [--changed | --since <ref>]`: apply safe lint fixes, then format.
- `lint [paths] [--fix]`: run Oxlint only.
- `format [paths] [--check | --write]`: run Oxfmt; check is the default.
- `deadcode [--production]`: report unused files, exports, and dependencies without modifying files.
- `init [--dry-run]`: configure a repository safely and idempotently.
- `doctor`: check installation, configuration, scripts, CI, agent context, and secret-shaped tracked files.

Example: `pnpm exec agent-lint check --since origin/main`.

Paths cannot be combined with `--changed` or `--since`. Shared output options are `--format agent|human|json`,
`--max-diagnostics <n>`, and `--no-diagnostic-limit`. Exit status is `0` when clean, `1` for findings, and `2` for
configuration or execution failures.

## Defaults

- All enabled rules are errors; warnings cannot accumulate unnoticed.
- `_`-prefixed variables and parameters are intentional.
- Production TypeScript rejects explicit `any`, non-null assertions, and unexplained suppression comments. Tests,
  fixtures, generated files, and tool configuration relax these restrictions.
- React enables hooks, accessibility, render purity, immutability, ref safety, and render-state correctness. Next.js,
  Jest, and Vitest add their native correctness checks.
- Formatting uses 120 columns, two spaces, no semicolons, single quotes including JSX, no trailing commas, and LF.
- Dependencies, framework/build output, package-manager and tool caches, deployment state, test reports, lockfiles,
  snapshots, fixture data, minified files, and conventional generated source are ignored.
- `check --typecheck` uses the repository's non-recursive `typecheck` script or its installed TypeScript compiler. No
  bundled compiler is substituted.

Agent output is one line per finding:

```text
src/example.ts:4:7 [typescript/no-explicit-any] Unexpected any. Specify a different type.
```

GitHub Actions annotations are automatic unless an output format is explicitly selected. Truncated output includes the
exact unlimited rerun command.

## Typed configuration

Most repositories should keep the generated configuration unchanged. Consumer values take precedence when an override
is genuinely needed; ignores and file overrides are additive.

```ts
import { createOxlintConfig } from '@apeck14/agent-lint'

export default createOxlintConfig({
  environment: 'universal',
  framework: 'next',
  testRunner: 'jest',
  ignores: ['public/vendor/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [{ name: 'legacy-client', message: 'Use the client in src/api/client.ts.' }]
      }
    ]
  }
})
```

```ts
import { createOxfmtConfig } from '@apeck14/agent-lint'

export default createOxfmtConfig({
  ignores: ['public/generated/**'],
  tailwind: { stylesheet: 'src/styles.css' },
  format: { printWidth: 110 }
})
```

Set `tailwind: false` to disable Tailwind sorting. Appended `overrides` are available from both factories.
Use import restrictions for repository-specific boundaries or deprecated APIs; include the replacement in `message`
so agents receive the repair guidance directly in diagnostics.

## Design rationale

Oxc provides native agent-oriented output and recommends tight lint/fix loops. Knip stays on demand because structural
analysis is valuable after dependency or module changes but unnecessary after every edit. Research on repository
instructions also suggests that oversized always-loaded guidance can increase reasoning cost without reliably improving
results, so generated instructions contain only commands and high-value guardrails.

- [Oxc coding-agent guidance](https://oxc.rs/docs/guide/usage/coding-agents.html)
- [AGENTS.md evaluation](https://arxiv.org/abs/2602.11988)
- [Configuration-smell study](https://arxiv.org/abs/2606.15828)

`doctor` is offline and read-only. The package has no consumer-mutating lifecycle scripts.

## License

ISC
