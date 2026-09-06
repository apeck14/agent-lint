# Agent instructions

- Keep the public API and CLI small, deterministic, and cross-platform.
- Never add install-time scripts or expose unsafe automatic fixes.
- After edits, run `pnpm format`, then `pnpm check` and `pnpm test`.
- Before packaging changes, run `pnpm package:check`.
