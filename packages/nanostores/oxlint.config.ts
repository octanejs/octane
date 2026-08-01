import loguxOxlintConfig from '@logux/oxc-configs/lint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [loguxOxlintConfig],
  ignorePatterns: ['*/errors.ts'],
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      rules: {
        'typescript/no-explicit-any': 'off'
      }
    },
    {
      // nanostores' `Store` type parameter defaults to `any`, so `store.get()`
      // and `store.value` are `any` at the binding layer. Upstream shipped
      // untyped JS plus hand-written .d.ts, so these type-aware rules never
      // applied to the implementation; the strict `tsc` run in test:types
      // still enforces the real public contract.
      files: ['index.ts'],
      rules: {
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/no-unsafe-type-assertion': 'off'
      }
    }
  ]
})
