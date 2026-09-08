import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as internal from '../../src/_internal/index';

describe('SWR U2 exact _internal runtime oracle', () => {
	it('exports every and only pinned runtime name', () => {
		const oracle = JSON.parse(
			readFileSync(resolve(import.meta.dirname, '../../audit/public-api.json'), 'utf8'),
		);
		expect(Object.keys(internal).sort()).toEqual(
			oracle.entrypoints['./_internal'].runtime.slice().sort(),
		);
	});
});
