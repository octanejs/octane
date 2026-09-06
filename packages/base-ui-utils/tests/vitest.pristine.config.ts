import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { baseUIPristineConfig } from '../../../scripts/react-parity/base-ui-pristine-config.mjs';

export default defineConfig(
	baseUIPristineConfig(resolve(import.meta.dirname, '..'), 'base-ui-utils'),
);
