# @apeck14/agent-lint

## Fast, focused guardrails for agentic coding

`agent-lint` is an opinionated quality baseline for JavaScript and TypeScript repos using agentic coding workflows. It
is especially suited to TypeScript services, APIs, bots, workers, React and Next.js apps, and small monorepos.

- ⚡ Runs native linting and formatting concurrently for short feedback loops.
- 🧠 Returns deterministic one-line diagnostics capped at 50, reducing agent token and context usage.
- Catches common mistakes such as unresolved or cyclic imports, ignored promises, unsafe TypeScript escapes, stale
  suppressions, broken React behavior, and focused or disabled tests.
- Formats code and common text formats consistently, reducing noisy diffs and repeated style decisions.
- Automates only safe fixes; slower dead-code analysis remains available on demand.

## 📊 Measured results

Across tested large JavaScript and TypeScript repositories using ESLint, migration benchmarks showed:

- Up to **35× faster** linting.
- Warm lint runs below **two seconds**.
- Dead-code scans completing in roughly **0.4–1.1 seconds**.

## 🚀 Quick start

Requires Node.js 22.18 or newer. npm, pnpm, Yarn, and Bun repositories are supported.

```sh
npx --yes @apeck14/agent-lint@1.0.0 init
```

The initializer is non-interactive and safe to run again. It:

- Detects the package manager, runtime, TypeScript, framework, and test runner.
- Installs an exact development dependency.
- Creates typed configuration and useful package scripts.
- Adds a concise managed workflow to `AGENTS.md`.
- Preserves custom files and reports conflicts instead of overwriting them.

Preview the exact changes without writing:

```sh
npx --yes @apeck14/agent-lint@1.0.0 init --dry-run
```

## 🔁 Daily workflow

Generated instructions use the repository's package manager. With pnpm, the normal loop is:

```sh
pnpm fix --changed # while working
pnpm check         # before finishing
pnpm deadcode      # after changing modules or dependencies
```

`--changed` includes staged, unstaged, renamed, and untracked files. If unrelated work is present, pass only the paths
you edited.

## 🧰 Commands

| Command                                                    | Purpose                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `check [paths] [--changed \| --since <ref>] [--typecheck]` | Lint and format concurrently, optionally with typechecking                 |
| `fix [paths] [--changed \| --since <ref>]`                 | Apply safe lint fixes, then format                                         |
| `lint [paths] [--fix]`                                     | Run Oxlint only                                                            |
| `format [paths] [--check \| --write]`                      | Run Oxfmt; check is the default                                            |
| `deadcode [--production]`                                  | Report unused files, exports, and dependencies without modifying files     |
| `init [--dry-run]`                                         | Configure a repository safely                                              |
| `doctor`                                                   | Diagnose installation, configuration, CI, instruction, and security issues |

For example, `pnpm exec agent-lint check --since origin/main` checks everything changed since the branch diverged from
`origin/main`, plus current working-tree changes.

Paths cannot be combined with `--changed` or `--since`. Output options are `--format agent|human|json`,
`--max-diagnostics <n>`, and `--no-diagnostic-limit`. Exit codes are `0` for clean, `1` for findings, and `2` for
configuration or execution failures.

## 🛡️ Guardrails and defaults

The defaults are strict where mistakes are likely to become bugs and practical around tests, generated files, and
tooling.

- All enabled rules are errors; warnings cannot accumulate unnoticed.
- `_`-prefixed variables and parameters are intentional.
- Production TypeScript rejects explicit `any`, non-null assertions, and unexplained suppression comments. Tests and
  generated or tooling files receive practical relaxations.
- React enables hooks, accessibility, render purity, immutability, ref safety, and render-state checks. Next.js, Jest,
  and Vitest add relevant native rules.
- Formatting uses 120 columns, two spaces, no semicolons, single quotes including JSX, no trailing commas, and LF.
- Dependencies, build output, caches, deployment state, reports, lockfiles, snapshots, fixtures, minified files, and
  conventional generated source are ignored.
- `check --typecheck` uses the repository's non-recursive `typecheck` script or its installed TypeScript compiler. No
  bundled compiler is substituted.

Findings stay compact and immediately actionable:

```text
src/example.ts:4:7 [typescript/no-explicit-any] Unexpected any. Specify a different type.
```

GitHub Actions receives annotations automatically. If output is truncated, the summary includes the exact command for
an unlimited rerun.

## 🔧 Customization

Start with the generated configuration unchanged. Add an override only for a real repository-specific need; consumer
values take precedence, while ignores and file overrides are additive.

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

The package also exports `createOxfmtConfig` with additive `ignores` and `overrides`, Tailwind v3/v4 configuration,
and final formatter overrides. Set `tailwind: false` to disable Tailwind sorting.

Repository-specific import restrictions are particularly useful for agents. Include the preferred replacement in the
rule message so the diagnostic explains how to repair the problem.

## 🧠 Design choices

- **Oxc is the foundation** because native linting and formatting keep feedback loops fast.
- **Knip stays on demand** because structural analysis is useful after module or dependency changes, not every edit.
- **Instructions stay short** because always-loaded guidance consumes context and does not consistently improve results.

- [Oxc coding-agent guidance](https://oxc.rs/docs/guide/usage/coding-agents.html)
- [AGENTS.md evaluation](https://arxiv.org/abs/2602.11988)
- [Configuration-smell study](https://arxiv.org/abs/2606.15828)

`doctor` is offline and read-only. The package has no consumer-mutating lifecycle scripts.

## License

ISC
