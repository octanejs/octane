import { cleanup } from '@octanejs/testing-library';
import { afterEach } from 'vitest';

// https://testing-library.com/docs/react-testing-library/api#cleanup
afterEach(function cleanupAfterEach() {
	cleanup();
});
