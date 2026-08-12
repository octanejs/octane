import { describe, expect, it } from 'vitest';
import {
	createLoader,
	createSerializer,
	parseAsInteger,
	parseAsString,
} from '@octanejs/nuqs/server';

describe('@octanejs/nuqs server entry', () => {
	// @parity-case ssr:nuqs-server-entry
	it('parses and serializes search params without a DOM or renderer', () => {
		expect(typeof document).toBe('undefined');
		const load = createLoader({ q: parseAsString.withDefault(''), page: parseAsInteger });
		expect(load('?q=octane&page=3')).toEqual({ q: 'octane', page: 3 });
		const serialize = createSerializer({ q: parseAsString, page: parseAsInteger });
		expect(serialize({ q: 'server', page: 2 })).toBe('?q=server&page=2');
	});
});
