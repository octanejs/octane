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

	it('does not render code actions when every code control is disabled', () => {
		const mounted = mount(StreamdownHarness, {
			children: '```ts\nconst answer = 42;\n```',
			controls: {
				code: { copy: false, download: false },
			},
			mode: 'static',
		});

		try {
			expect(mounted.container.querySelector('[data-streamdown="code-block-actions"]')).toBeNull();
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

	it('keeps code rows block-level when line numbers are hidden', () => {
		const mounted = mount(StreamdownHarness, {
			children: '```ts\nconst first = 1;\nconst second = 2;\n```',
			controls: false,
			lineNumbers: false,
			mode: 'static',
		});

		try {
			const rows = mounted.container.querySelectorAll(
				'[data-streamdown="code-block-body"] code > span',
			);
			expect(rows).toHaveLength(2);
			for (const row of rows) {
				expect(row.classList.contains('block')).toBe(true);
			}
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
