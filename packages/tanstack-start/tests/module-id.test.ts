import { describe, expect, it } from 'vitest';
import {
	appendIdQueryFlag,
	hasIdQueryFlag,
	removeIdQueryFlag,
} from '../src/internal/start-plugin-core/vite/module-id.js';

const flag = 'server-fn-module-lookup';

describe('TanStack Start module ID query flags', () => {
	it.each([
		['/src/route.ts', false],
		[`/src/route.ts?${flag}`, true],
		[`/src/route.ts?mode=dev&${flag}`, true],
		[`/src/route.ts?${flag}=enabled`, true],
		[`/src/route.ts?mode=${flag}`, false],
		[`/src/route.ts?${flag}-suffix`, false],
	])('recognizes the query parameter name in %s', (id, expected) => {
		expect(hasIdQueryFlag(id, flag)).toBe(expected);
	});

	it.each([
		['/src/route.ts', `/src/route.ts?${flag}`],
		['/src/route.ts?mode=dev', `/src/route.ts?mode=dev&${flag}`],
		['/src/route.ts?', `/src/route.ts?&${flag}`],
		['/src/route.ts?mode=dev&', `/src/route.ts?mode=dev&${flag}`],
	])('appends the owned flag without normalizing %s', (id, expected) => {
		expect(appendIdQueryFlag(id, flag)).toBe(expected);
	});

	it.each([
		[`/src/route.ts?${flag}`, '/src/route.ts'],
		[`/src/route.ts?mode=dev&${flag}`, '/src/route.ts?mode=dev'],
		[`/src/route.ts?${flag}&mode=dev`, `/src/route.ts?${flag}&mode=dev`],
		['/src/route.ts?mode=dev', '/src/route.ts?mode=dev'],
	])('removes only an appended owned flag from %s', (id, expected) => {
		expect(removeIdQueryFlag(id, flag)).toBe(expected);
	});

	it.each([
		'/src/route.ts',
		'/src/route.ts?',
		'/src/route.ts?variant=client',
		'\0virtual:factory?variant=client&encoded=a%2Fb',
		`/src/route.ts?${flag}`,
	])('round-trips the original opaque ID %s', (id) => {
		const withFlag = appendIdQueryFlag(id, flag);
		expect(removeIdQueryFlag(withFlag, flag)).toBe(id);
	});
});
