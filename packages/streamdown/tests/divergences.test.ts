import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { Streamdown } from '@octanejs/streamdown';
import { mount } from '../../octane/tests/_helpers';
import { NativeEventProbe } from './_fixtures/divergence-events.tsrx';

describe('@octanejs/streamdown documented runtime divergences', () => {
	it('delivers native DOM events to custom Markdown components', () => {
		const root = mount(NativeEventProbe);
		const anchor = root.container.querySelector('a');
		expect(anchor).not.toBeNull();
		flushSync(() => anchor?.click());
		expect(root.container.querySelector('[data-testid="event-result"]')?.textContent).toBe(
			'native-anchor',
		);
		root.unmount();
	});

	it('emits balanced code-block background classes', async () => {
		const root = mount(Streamdown, {
			children: '```ts\nconst value = 1;\n```',
			controls: false,
			mode: 'static' as const,
		});
		await vi.waitFor(() =>
			expect(
				root.container.querySelector('[data-streamdown="code-block-body"] pre'),
			).not.toBeNull(),
		);
		const pre = root.container.querySelector('[data-streamdown="code-block-body"] pre')!;
		expect(pre.classList.contains('bg-[var(--sdm-bg,inherit)]')).toBe(true);
		expect(pre.classList.contains('dark:bg-[var(--shiki-dark-bg,var(--sdm-bg,inherit))]')).toBe(
			true,
		);
		root.unmount();
	});

	it('consumes built-in icon sizes into SVG dimensions', async () => {
		const root = mount(Streamdown, {
			children: '```ts\nconst value = 1;\n```',
			controls: { code: { copy: true, download: true } },
			mode: 'static' as const,
		});
		await vi.waitFor(() =>
			expect(root.container.querySelectorAll('svg[viewBox="0 0 16 16"]')).toHaveLength(2),
		);
		for (const icon of root.container.querySelectorAll('svg[viewBox="0 0 16 16"]')) {
			expect(icon.hasAttribute('size')).toBe(false);
			expect(icon.getAttribute('height')).toBe('14');
			expect(icon.getAttribute('width')).toBe('14');
		}
		root.unmount();
	});
});
