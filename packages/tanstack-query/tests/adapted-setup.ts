import '@testing-library/jest-dom/vitest';
import { act, cleanup } from '@octanejs/testing-library';
import { afterEach } from 'vitest';
import { notifyManager } from '@tanstack/query-core';

afterEach(cleanup);
notifyManager.setNotifyFunction((fn) => {
	act(fn);
});
