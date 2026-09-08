import {
  baseConfigs,
  commonRules,
  componentRules,
  importConfig,
  jsdoc,
} from '@formisch/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'eslint.config.js']),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      ...baseConfigs,
      importConfig,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { jsdoc },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: commonRules,
  },
  {
    files: ['src/components/**/*.tsx'],
    rules: componentRules,
  },
]);
