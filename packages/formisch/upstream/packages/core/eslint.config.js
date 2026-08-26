import {
  baseConfigs,
  createSourceConfig,
  tseslint,
} from '@formisch/eslint-config';

export default tseslint.config(
  { ignores: ['eslint.config.js', 'tsdown.config.ts'] },
  ...baseConfigs,
  createSourceConfig({
    tsconfigRootDir: import.meta.dirname,
    files: ['src/**/*.ts'],
    extraRules: {
      // Core-specific rules
      'import/named': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  })
);
