import { describe, expect, it } from 'vitest';
import { createElement, createRoot, flushSync, hydrateRoot } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { act } from './_helpers.js';

const emptyValues = [null, undefined, false, true, ''];

describe('empty descriptor children', () => {
	it.each([false, true])('preserves empty hosts and following siblings (hydrate=%s)', (hydrate) => {
		const picks: string[] = [];
		const attached: Element[] = [];
		const detached: Element[] = [];
		const ref = (element: Element | null) => {
			if (element !== null) {
				attached.push(element);
				return () => detached.push(element);
			}
		};
		function View({ children }: { children: unknown }) {
			return createElement(
				'div',
				null,
				createElement('section', { 'data-empty': '', ref }, children),
				createElement('input', { defaultValue: 'initial' }),
				createElement('button', { onClick: () => picks.push('picked') }, 'next'),
			);
		}
		function ServerView() {
			return ServerRuntime.createElement(
				'div',
				null,
				ServerRuntime.createElement('section', { 'data-empty': '' }, ''),
				ServerRuntime.createElement('input', { defaultValue: 'initial' }),
				ServerRuntime.createElement('button', null, 'next'),
			);
		}
		const container = document.createElement('div');
		document.body.appendChild(container);
		if (hydrate) container.innerHTML = ServerRuntime.renderToString(ServerView).html;
		const serverSection = container.querySelector('section');
		const serverInput = container.querySelector('input');
		if (serverInput !== null) serverInput.value = 'typed before hydration';
		const root = hydrate
			? hydrateRoot(container, createElement(View, { children: '' }))
			: createRoot(container);
		try {
			if (!hydrate) root.render(View, { children: '' });
			flushSync(() => {});
			const section = container.querySelector('section')!;
			const input = container.querySelector('input')!;
			if (hydrate) {
				expect(section).toBe(serverSection);
				expect(input).toBe(serverInput);
				expect(input.value).toBe('typed before hydration');
			}
			input.value = 'typed';
			for (const children of emptyValues) {
				flushSync(() => root.render(View, { children }));
				expect(container.querySelector('section')).toBe(section);
				expect(section.innerHTML).toBe('');
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('typed');
			}
			for (const children of emptyValues) {
				flushSync(() =>
					root.render(View, { children: createElement('strong', null, 'temporary') }),
				);
				expect(section.textContent).toBe('temporary');
				flushSync(() => root.render(View, { children }));
				expect(section.innerHTML).toBe('');
			}
			const external = document.createElement('em');
			external.textContent = 'external';
			section.appendChild(external);
			for (const children of emptyValues) {
				flushSync(() => root.render(View, { children }));
				expect(section.firstChild).toBe(external);
			}
			flushSync(() => container.querySelector('button')!.click());
			expect(picks).toEqual(['picked']);
			expect(attached).toEqual([section]);
			expect(detached).toEqual([]);
			root.unmount();
			expect(detached).toEqual([section]);
			expect(container.innerHTML).toBe('');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('restores removed children when a later sibling suspends and clears them on retry', async () => {
		let release!: () => void;
		const promise = new Promise<void>((resolve) => {
			release = resolve;
		});
		let pending = false;
		function Later() {
			if (pending) throw promise;
			return createElement('p', null, 'ready');
		}
		function View({ empty }: { empty: boolean }) {
			return [
				createElement(
					'section',
					{ key: 'host' },
					empty ? null : createElement('input', { defaultValue: 'initial' }),
				),
				createElement(Later, { key: 'later' }),
			];
		}
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(View, { empty: false });
			const section = container.querySelector('section')!;
			const input = container.querySelector('input')!;
			input.value = 'draft';
			pending = true;
			flushSync(() => root.render(View, { empty: true }));
			expect(container.querySelector('section')).toBe(section);
			expect(section.querySelector('input')).toBe(input);
			expect(input.value).toBe('draft');
			await act(async () => {
				pending = false;
				release();
				await promise;
			});
			expect(container.querySelector('section')).toBe(section);
			expect(section.innerHTML).toBe('');
			expect(container.querySelector('p')!.textContent).toBe('ready');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
