import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { baseUIPristineConfig } from '../../../scripts/react-parity/base-ui-pristine-config.mjs';
const config = baseUIPristineConfig(resolve(import.meta.dirname, '..'), 'base-ui');
export default defineConfig({
	...config,
	test: { ...config.test, include: ['tests/react-controls/*.test.jsx'] },
});
