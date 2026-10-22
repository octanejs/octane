// Values that need no element factory render through compiled `lazy`,
// Suspense and ViewTransition call sites. Nothing in this file builds an
// element descriptor, so these renders run without the host-descriptor
// renderers that element factories install.
import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers.js';
import {
	LazyValue,
	TextFallback,
	TransitionValue,
	settleSlow,
} from './_fixtures/function-tag-values.tsrx';

describe('factory-free values at compiled component call sites', () => {
	it('renders text, numbers, arrays and empties returned by a lazy component', () => {
		const view = mount(LazyValue, { value: 'text' });
		try {
			const section = view.container.querySelector('section')!;
			expect(section.textContent).toBe('text');
			for (const [value, text] of [
				[42, '42'],
				[['a', 'b', 'c'], 'abc'],
				[null, ''],
				[false, ''],
				['again', 'again'],
			] as const) {
				view.update(LazyValue, { value });
				expect(view.container.querySelector('section')).toBe(section);
				expect(section.textContent).toBe(text);
			}
		} finally {
			view.unmount();
		}
	});

	it('shows a text fallback until a lazy child loads', async () => {
		const view = mount(TextFallback);
		try {
			expect(view.container.querySelector('main')!.textContent).toBe('Loading');
			await act(async () => settleSlow('Loaded'));
			expect(view.container.querySelector('main')!.textContent).toBe('Loaded');
		} finally {
			view.unmount();
		}
	});

	it('renders text and array children inside a ViewTransition', () => {
		const view = mount(TransitionValue, { value: 'one' });
		try {
			const article = view.container.querySelector('article')!;
			expect(article.textContent).toBe('one');
			view.update(TransitionValue, { value: ['x', 'y'] });
			expect(article.textContent).toBe('xy');
			view.update(TransitionValue, { value: null });
			expect(article.textContent).toBe('');
		} finally {
			view.unmount();
		}
	});
});
