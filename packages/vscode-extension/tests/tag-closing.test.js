import { describe, expect, it } from 'vitest';
import { findOpeningTagAtOffset } from '../src/tag-closing.cjs';

function tagAtEnd(source) {
	return findOpeningTagAtOffset(source, source.length);
}

describe('TSRX JSX tag closing', () => {
	it('recognizes multiline host tags with dynamic attributes', () => {
		expect(
			tagAtEnd(`<button
  class={active === item.id ? 'active' : ''}
  onClick={() => setActive(item.id)}
>`),
		).toBe('button');
	});

	it('recognizes member component tags and quoted greater-than characters', () => {
		expect(tagAtEnd(`<Menu.Item label="Next >">`)).toBe('Menu.Item');
	});

	it('ignores closing, self-closing, incomplete, and generic-looking tags', () => {
		expect(tagAtEnd('</button>')).toBeUndefined();
		expect(tagAtEnd('<button />')).toBeUndefined();
		expect(findOpeningTagAtOffset('<button', 7)).toBeUndefined();
		expect(tagAtEnd('identity<T>')).toBeUndefined();
	});
});
