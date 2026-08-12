import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('react-dropzone 20.0.0 pristine runtime evidence', () => {
	it('records every unchanged collected and executed identity', () => {
		const inventory = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, '../../audit/runtime-inventories/pristine-runtime.json'),
				'utf8',
			),
		);
		expect(inventory.collected).toBe(218);
		expect(inventory.executed).toBe(218);
		expect(inventory.skipped).toBe(0);
		expect(inventory.cases).toHaveLength(218);
		expect(inventory.cases.every((test: { status: string }) => test.status === 'passed')).toBe(
			true,
		);
	});
});
