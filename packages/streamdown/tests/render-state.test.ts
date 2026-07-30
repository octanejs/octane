import { describe, expect, it } from 'vitest';
import { createElement, drainPassiveEffects, flushSync } from 'octane';
import { Streamdown, type StreamdownProps } from '@octanejs/streamdown';
import { mount } from '../../octane/tests/_helpers';

function StreamdownHarness(props: StreamdownProps) {
	return createElement(Streamdown, props);
}

describe('@octanejs/streamdown render state', () => {
	it('updates context-backed controls when the Markdown is unchanged', () => {
		const props = {
			children: '```ts\nconst answer = 42;\n```',
			mode: 'static' as const,
		};
		const mounted = mount(StreamdownHarness, { ...props, controls: true });

		try {
			expect(
				mounted.container.querySelector('[data-streamdown="code-block-copy-button"]'),
			).not.toBeNull();

			mounted.update(StreamdownHarness, { ...props, controls: false });

			expect(
				mounted.container.querySelector('[data-streamdown="code-block-copy-button"]'),
			).toBeNull();
		} finally {
			mounted.unmount();
		}
	});

	it('updates Markdown options inside existing streaming blocks', () => {
		const props = {
			children: 'A paragraph.',
			controls: false,
			mode: 'streaming' as const,
		};
		const mounted = mount(StreamdownHarness, {
			...props,
			disallowedElements: [],
		});

		try {
			expect(mounted.container.querySelector('p')?.textContent).toBe('A paragraph.');

			mounted.update(StreamdownHarness, {
				...props,
				disallowedElements: ['p'],
			});

			expect(mounted.container.querySelector('p')).toBeNull();
		} finally {
			mounted.unmount();
		}
	});

	it('tracks animated text independently for sibling streaming blocks', () => {
		const props = {
			animated: { duration: 150, sep: 'word', stagger: 0 },
			controls: false,
			isAnimating: true,
			mode: 'streaming' as const,
		};
		const mounted = mount(StreamdownHarness, {
			...props,
			children: '# First block',
		});

		try {
			mounted.update(StreamdownHarness, {
				...props,
				children: '# First block\nSecond block.',
			});
			drainPassiveEffects();
			flushSync(() => {});

			const firstAnimatedText =
				mounted.container.querySelector<HTMLElement>('h1 [data-sd-animate]');
			const secondAnimatedText =
				mounted.container.querySelector<HTMLElement>('p [data-sd-animate]');

			expect(firstAnimatedText?.style.getPropertyValue('--sd-duration')).toBe('150ms');
			expect(secondAnimatedText?.style.getPropertyValue('--sd-duration')).toBe('150ms');
		} finally {
			mounted.unmount();
		}
	});
});
