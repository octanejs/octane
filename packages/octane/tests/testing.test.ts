import { describe, expect, it } from 'vitest';
import { clampJsdomScrollTop } from 'octane/testing';

describe('octane/testing', () => {
	it('clamps an out-of-range jsdom scrollTop and dispatches the native scroll event', () => {
		const element = document.createElement('div');
		element.scrollTop = 26;
		let scrolls = 0;
		element.addEventListener('scroll', () => scrolls++);

		expect(element.scrollHeight).toBe(0);
		expect(element.clientHeight).toBe(0);
		expect(element.scrollTop).toBe(26);

		clampJsdomScrollTop(element);

		expect(element.scrollTop).toBe(0);
		expect(scrolls).toBe(1);
	});
});
