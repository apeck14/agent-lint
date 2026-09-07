# @apeck14/agent-lint

## Fast, focused guardrails for agentic coding

`agent-lint` is an opinionated quality baseline for JavaScript and TypeScript repos using agentic coding workflows. It
is especially suited to TypeScript services, APIs, bots, workers, React and Next.js apps, and small monorepos.

- ⚡ Runs native linting and formatting concurrently for short feedback loops.
- 🧠 Returns deterministic one-line diagnostics capped at 50, reducing agent token and context usage.
- Catches common mistakes such as cyclic imports, unhandled Promise chains, unsafe TypeScript escapes, stale
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
npx --yes @apeck14/agent-lint@latest init
```

The initializer detects your tooling, installs an exact dev dependency, creates typed configs and package scripts, and
adds a short workflow to `AGENTS.md`. It runs without prompts and preserves custom files and scripts, reporting conflicts.

Rerunning `init` preserves edits to generated configuration, including factory options. If the detected framework or
test runner changes, update those options manually.

Preview the exact changes without writing:

```sh
npx --yes @apeck14/agent-lint@latest init --dry-run
```

## 🔁 Daily workflow

Generated instructions use the repository's package manager. With pnpm, the normal loop is:

```sh
pnpm fix --changed # while working
pnpm check         # before finishing
pnpm deadcode      # after changing modules or dependencies
```

Run relevant tests too; `check` does not run them.

`--changed` includes staged, unstaged, renamed, and untracked files. If unrelated work is present, pass only the paths
you edited. When run inside a monorepo package, Git selection stays within that directory.

## 🧰 Commands

| Command    | Purpose                                                                             |
| ---------- | ----------------------------------------------------------------------------------- |
| `check`    | Check lint and formatting; add `--typecheck` for compiler diagnostics               |
| `fix`      | Apply safe lint fixes, then format                                                  |
| `lint`     | Lint only; add `--fix` for safe fixes                                               |
| `format`   | Check formatting; use `--write` to apply it                                         |
| `deadcode` | Report unused files, exports, and dependencies; supports `--production`             |
| `init`     | Configure a repository; use `--dry-run` to preview                                  |
| `doctor`   | Inspect setup, CI wiring, agent instructions, and potential tracked secrets offline |

`check`, `fix`, `lint`, and `format` accept file or directory paths. `check` and `fix` also support `--changed` or
`--since <ref>` instead of paths.

For example, `pnpm exec agent-lint check --since origin/main` checks everything changed since the branch diverged from
`origin/main`, plus current working-tree changes.

Output options are `--format agent|human|json`,
`--max-diagnostics <n>`, and `--no-diagnostic-limit`. Exit codes are `0` for clean, `1` for findings, and `2` for
configuration or execution failures.

## 🛡️ Guardrails and defaults

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

Lint rules are syntax-based, including Promise-chain checks. Type-aware floating-Promise analysis is not included.
`check --typecheck` adds compiler diagnostics, such as unresolved TypeScript imports, rather than type-aware lint rules.

Findings stay compact and immediately actionable:

```text
src/example.ts:4:7 [typescript/no-explicit-any] Unexpected any. Specify a different type.
```

GitHub Actions receives annotations unless you select an output format. Truncated output includes the command for an
unlimited rerun.

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

There are no install-time scripts or automatic hooks. `doctor` and `deadcode` are read-only.

## License

ISC
