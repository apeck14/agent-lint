export const COMMON_IGNORE_PATTERNS = [
  // Dependencies and package-manager state.
  '**/node_modules/**',
  '**/vendor/**',
  '**/.pnpm-store/**',
  '**/.yarn/cache/**',
  '**/.yarn/unplugged/**',
  '**/.pnp.*',

  // Build and framework output.
  '**/dist/**',
  '**/build/**',
  '**/output/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.svelte-kit/**',
  '**/.astro/**',
  '**/.angular/**',
  '**/.docusaurus/**',
  '**/.expo/**',
  '**/.react-router/**',
  '**/storybook-static/**',

  // Tool caches, deployment state, and test reports.
  '**/coverage/**',
  '**/.nyc_output/**',
  '**/.cache/**',
  '**/.turbo/**',
  '**/.nx/**',
  '**/.vite/**',
  '**/.parcel-cache/**',
  '**/.vercel/**',
  '**/.netlify/**',
  '**/.serverless/**',
  '**/.wrangler/**',
  '**/playwright-report/**',
  '**/blob-report/**',
  '**/test-results/**',

  // Generated source and artifacts.
  '**/*.min.*',
  '**/*.snap',
  '**/*.generated.*',
  '**/*.gen.*',
  '**/generated/**',
  '**/__generated__/**',
  '**/next-env.d.ts'
]

export const FORMAT_ONLY_IGNORE_PATTERNS = [
  '**/{fixtures,__fixtures__,mocks}/**/*.{json,json5,jsonc,yaml,yml,html,md,mdx}',
  '**/package-lock.json',
  '**/npm-shrinkwrap.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/bun.lock',
  '**/bun.lockb'
]
