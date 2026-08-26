import {
  baseConfigs,
  createSourceConfig,
  createTestConfig,
  tseslint,
} from '@formisch/eslint-config';

export default tseslint.config(
  { ignores: ['eslint.config.js'] },
  ...baseConfigs,
  createSourceConfig({
    tsconfigRootDir: import.meta.dirname,
    files: ['src/**/*.ts'],
    extraRules: {
      // Methods-specific rules
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  }),
  createTestConfig({ files: ['src/**/*.{test,test-d}.ts'] })
);
