import { describe, expect, it } from 'vitest';
import { formatValuePreview, serializeValue } from '@octanejs/devtools';

describe('serializeValue', () => {
	it('serializes primitives with type tags', () => {
		expect(serializeValue(undefined)).toEqual({ t: 'undefined' });
		expect(serializeValue(null)).toEqual({ t: 'null' });
		expect(serializeValue('hi')).toEqual({ t: 'string', v: 'hi' });
		expect(serializeValue(3)).toEqual({ t: 'number', v: 3 });
		expect(serializeValue(NaN)).toEqual({ t: 'number', v: 'NaN' });
		expect(serializeValue(true)).toEqual({ t: 'boolean', v: true });
		expect(serializeValue(10n)).toEqual({ t: 'bigint', v: '10' });
		expect(serializeValue(Symbol('tag'))).toEqual({ t: 'symbol', v: 'tag' });
	});

	it('keeps function identity as a name only', () => {
		function setCount(): void {}
		expect(serializeValue(setCount)).toEqual({ t: 'function', name: 'setCount' });
		expect(serializeValue(() => {})).toEqual({ t: 'function', name: '<anonymous>' });
	});

	it('bounds depth, entry count, and string length', () => {
		const deep = { a: { b: { c: { d: { e: 1 } } } } };
		const serialized = serializeValue(deep, { maxDepth: 2 });
		expect(JSON.stringify(serialized)).toContain('max-depth');

		const wide = serializeValue(
			Array.from({ length: 40 }, (_, index) => index),
			{ maxEntries: 5 },
		);
		expect(wide).toMatchObject({ t: 'array', length: 40, truncated: true });
		expect((wide as { items: unknown[] }).items).toHaveLength(5);

		const long = serializeValue('x'.repeat(500), { maxString: 10 });
		expect(long).toMatchObject({ t: 'string', v: 'xxxxxxxxxx', truncated: true });
	});

	it('survives cycles and throwing getters', () => {
		const cyclic: Record<string, unknown> = { name: 'node' };
		cyclic.self = cyclic;
		const serialized = serializeValue(cyclic);
		expect(JSON.stringify(serialized)).toContain('circular');

		const trapped = {};
		Object.defineProperty(trapped, 'boom', {
			enumerable: true,
			get() {
				throw new Error('no');
			},
		});
		expect(JSON.stringify(serializeValue(trapped))).toContain('getter threw');
	});

	it('summarizes collections, dates, errors, and DOM nodes', () => {
		expect(serializeValue(new Map([['k', 1]]))).toMatchObject({ t: 'map', size: 1 });
		expect(serializeValue(new Set([1, 2]))).toMatchObject({ t: 'set', size: 2 });
		expect(serializeValue(new Date('2026-01-02T03:04:05Z'))).toEqual({
			t: 'date',
			v: '2026-01-02T03:04:05.000Z',
		});
		expect(serializeValue(new Error('nope'))).toEqual({
			t: 'error',
			name: 'Error',
			message: 'nope',
		});
		expect(serializeValue(document.createElement('section'))).toEqual({
			t: 'element',
			tag: 'section',
		});
	});

	it('keeps DOM-shaped application objects as objects, not element tags', () => {
		// Parser/AST/vdom state legitimately carries nodeType/nodeName fields;
		// only real DOM nodes collapse to a tag.
		const astNode = { nodeType: 1, nodeName: 'paragraph', children: ['text'], depth: 2 };
		const serialized = serializeValue(astNode);
		expect(serialized.t).toBe('object');
		expect(JSON.stringify(serialized)).toContain('depth');
	});

	it('round-trips through JSON (the MCP/snapshot transport)', () => {
		const value = serializeValue({ list: [1, 'two', { three: true }], when: new Date() });
		expect(JSON.parse(JSON.stringify(value))).toEqual(value);
	});
});

describe('formatValuePreview', () => {
	it('renders a compact single line and honors the length cap', () => {
		const preview = formatValuePreview(serializeValue({ count: 3, label: 'items' }));
		expect(preview).toBe('{count: 3, label: "items"}');
		const long = formatValuePreview(serializeValue('y'.repeat(300)), 20);
		expect(long.length).toBeLessThanOrEqual(20);
		expect(long.endsWith('…')).toBe(true);
	});
});
