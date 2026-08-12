// Ported from react-transition-group@4.4.5 test/ChildMapping-test.js (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';
import { getChildMapping, mergeChildMappings } from '../../src/utils/ChildMapping.ts';

describe('ChildMapping', function childMappingSuite() {
	// Per path: packages/transition-group/upstream/test/ChildMapping-test.js:10-32
	it('should support getChildMapping', function supportsGetChildMapping() {
		const oneone = createElement('div', { key: 'oneone' });
		const onetwo = createElement('div', { key: 'onetwo' });
		const one = createElement('div', { key: 'one' }, oneone, onetwo);
		const two = createElement('div', { key: 'two' }, 'foo');
		const mapping = getChildMapping([one, two]);
		expect(mapping['.$one'].props).toEqual(one.props);
		expect(mapping['.$two'].props).toEqual(two.props);
	});

	// Per path: packages/transition-group/upstream/test/ChildMapping-test.js:33-49
	it('should support mergeChildMappings for adding keys', function mergeAddingKeys() {
		const prev = { one: true, two: true } as any;
		const next = { one: true, two: true, three: true } as any;
		expect(mergeChildMappings(prev, next)).toEqual({
			one: true,
			two: true,
			three: true,
		});
	});

	// Per path: packages/transition-group/upstream/test/ChildMapping-test.js:50-66
	it('should support mergeChildMappings for removing keys', function mergeRemovingKeys() {
		const prev = { one: true, two: true, three: true } as any;
		const next = { one: true, two: true } as any;
		expect(mergeChildMappings(prev, next)).toEqual({
			one: true,
			two: true,
			three: true,
		});
	});

	// Per path: packages/transition-group/upstream/test/ChildMapping-test.js:67-85
	it('should support mergeChildMappings for adding and removing', function mergeAddRemove() {
		const prev = { one: true, two: true, three: true } as any;
		const next = { one: true, two: true, four: true } as any;
		expect(mergeChildMappings(prev, next)).toEqual({
			one: true,
			two: true,
			three: true,
			four: true,
		});
	});

	// Per path: packages/transition-group/upstream/test/ChildMapping-test.js:86-107
	it('should reconcile overlapping insertions and deletions', function reconcileOverlap() {
		const prev = { one: true, two: true, four: true, five: true } as any;
		const next = { one: true, two: true, three: true, five: true } as any;
		expect(mergeChildMappings(prev, next)).toEqual({
			one: true,
			two: true,
			three: true,
			four: true,
			five: true,
		});
	});

	// Per path: packages/transition-group/upstream/test/ChildMapping-test.js:108-148
	it('should support mergeChildMappings with undefined input', function mergeUndefined() {
		const prev = { one: true, two: true } as any;
		expect(mergeChildMappings(prev, undefined)).toEqual({
			one: true,
			two: true,
		});
		expect(mergeChildMappings(undefined, { three: true, four: true } as any)).toEqual({
			three: true,
			four: true,
		});
	});
});
