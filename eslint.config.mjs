import nextConfig from 'eslint-config-next'

const config = [
  ...nextConfig,
  {
    ignores: ['drizzle/**'],
  },
  {
    rules: {
      // Flags legitimate one-time sync-on-mount/dialog-open effects (e.g.
      // reading DOM state, resetting local UI state when a dialog opens) as
      // an anti-pattern. Kept as a warning rather than disabled outright.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]

export default config
