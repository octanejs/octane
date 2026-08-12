import { defineConfig } from 'vitest/config';
import { octane } from '../octane/src/compiler/vite.js';

export default defineConfig({
	plugins: [octane()],
});
