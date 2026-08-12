import { defaultUrlTransform as reactDefaultUrlTransform } from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { defaultUrlTransform } from '../../src/url-transform';

describe('the pinned URL oracle', () => {
	it.each([['', '']])('transforms %j to %j', (input, expected) => {
		expect(defaultUrlTransform(input)).toBe(expected);
		expect(defaultUrlTransform(input)).toBe(reactDefaultUrlTransform(input));
	});
});
