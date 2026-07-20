/**
 * @octanejs/nuqs core — the framework-agnostic surface vendored verbatim from
 * nuqs (parsers, serializer, loader, the bijectivity test helpers and the
 * server entry). These carry no octane/react dependency, so they run as plain
 * unit tests with no renderer.
 */
import { describe, it, expect } from 'vitest';
import {
	createLoader,
	createSerializer,
	parseAsArrayOf,
	parseAsBoolean,
	parseAsFloat,
	parseAsInteger,
	parseAsString,
} from '@octanejs/nuqs';
import { isParserBijective } from '@octanejs/nuqs/testing';
import * as server from '@octanejs/nuqs/server';

describe('parsers', () => {
	it('parse and serialize round-trip (bijective)', () => {
		expect(isParserBijective(parseAsInteger, '42', 42)).toBe(true);
		expect(isParserBijective(parseAsFloat, '3.14', 3.14)).toBe(true);
		expect(isParserBijective(parseAsBoolean, 'true', true)).toBe(true);
		expect(isParserBijective(parseAsString, 'hello', 'hello')).toBe(true);
		// parseAsArrayOf serializes to a single delimited string (default ','),
		// not a repeated (multi) param.
		expect(isParserBijective(parseAsArrayOf(parseAsInteger), '1,2,3', [1, 2, 3])).toBe(true);
	});

	it('returns null for invalid input', () => {
		expect(parseAsInteger.parse('not-a-number')).toBeNull();
	});

	it('withDefault yields the default and drops null', () => {
		const p = parseAsInteger.withDefault(10);
		expect(p.parseServerSide(undefined)).toBe(10);
		expect(p.parseServerSide('5')).toBe(5);
	});
});

describe('createSerializer', () => {
	it('builds a query string from a parser map', () => {
		const serialize = createSerializer({
			q: parseAsString,
			page: parseAsInteger,
		});
		expect(serialize({ q: 'octane', page: 2 })).toBe('?q=octane&page=2');
	});

	it('omits null values', () => {
		const serialize = createSerializer({ q: parseAsString, page: parseAsInteger });
		expect(serialize({ q: 'x', page: null })).toBe('?q=x');
	});
});

describe('createLoader', () => {
	it('parses a search-params record with defaults', () => {
		const load = createLoader({
			q: parseAsString.withDefault(''),
			page: parseAsInteger.withDefault(1),
		});
		expect(load('?q=hi&page=4')).toEqual({ q: 'hi', page: 4 });
		expect(load('')).toEqual({ q: '', page: 1 });
	});
});

describe('server entry', () => {
	it('exposes the react-free server surface (loader/serializer/parsers)', () => {
		expect(typeof server.createLoader).toBe('function');
		expect(typeof server.createSerializer).toBe('function');
		expect(typeof server.parseAsInteger).toBe('object');
	});

	it('does NOT ship createSearchParamsCache (RSC-only, see status.json)', () => {
		expect((server as Record<string, unknown>).createSearchParamsCache).toBeUndefined();
	});
});
