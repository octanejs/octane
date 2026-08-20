import { afterEach } from 'vitest';
import { cleanup } from '@octanejs/testing-library';

afterEach(function cleanupRender() {
	cleanup();
});
