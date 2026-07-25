import { describe, expect, it } from 'vitest';

import { installMainThreadProcessData } from '../src/main-thread-process-data.js';

describe('Lynx main-thread data processor', () => {
	it('installs the identity hook required before public lifecycle dispatch', () => {
		const target: { processData?: (data: unknown) => unknown } = {};
		const processData = installMainThreadProcessData(target);
		const data = { accountId: 'account-a' };

		expect(processData(data)).toBe(data);
		expect(target.processData).toBe(processData);
	});

	it('replaces stale hooks because the generated entry owns the processor', () => {
		const existing = (data: unknown) => ({ data });
		const target = { processData: existing };
		const processData = installMainThreadProcessData(target);
		const data = { accountId: 'account-a' };

		expect(processData).not.toBe(existing);
		expect(processData(data)).toBe(data);
		expect(target.processData).toBe(processData);
	});
});
