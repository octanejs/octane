import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { createElement, createRoot, hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';
import {
	Counter,
	ConditionalChild,
	SpreadButton,
	SpreadButtonPair,
	StatefulLabel,
	bump,
} from './_fixtures/markerless-text.tsx';

// A sole renderable child must adopt the existing server text, whether the
// host has static attributes or forwards a spread of component props.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/markerless-text.tsx',
);

describe('hydrateRoot — only-child renderable text', () => {
	const server = loadServerFixture(FIXTURE, { id: 'markerless-text.tsx' });
	let container: HTMLElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	afterEach(() => container.remove());

	it('adopts and updates the server text in a host without a spread', () => {
		const { html } = ServerRT.renderToString(server.Counter, {});
		container.innerHTML = html;
		const span = container.querySelector('#c') as HTMLElement;
		const textNode = Array.from(span.childNodes).find((node) => node.nodeType === 3)!;
		expect(textNode).toBeDefined();
		expect(span.textContent).toBe('0');

		const root = hydrateRoot(container, Counter, {});
		try {
			flushSync(() => {});
			expect(container.querySelector('#c')).toBe(span);
			expect(span.contains(textNode)).toBe(true);
			expect(span.textContent).toBe('0');

			flushSync(() => bump());
			expect(span.textContent).toBe('1');
			expect(span.contains(textNode)).toBe(true);
		} finally {
			root.unmount();
		}
	});

	it.each([
		{ label: 'a string', children: 'Open', expected: 'Open' },
		{ label: 'escaped text', children: 'Open & <close>', expected: 'Open & <close>' },
		{ label: 'parser-normalized text', children: 'Open\r\nnext', expected: 'Open\nnext' },
		{ label: 'an empty string', children: '', expected: '' },
		{ label: 'false', children: false, expected: '' },
		{ label: 'true', children: true, expected: '' },
		{ label: 'null', children: null, expected: '' },
		{ label: 'undefined', children: undefined, expected: '' },
		{ label: 'zero', children: 0, expected: '0' },
		{ label: 'a number', children: 42, expected: '42' },
	])('adopts and updates a spread-bearing host from $label', ({ children, expected }) => {
		const props = { children, title: 'server' };
		container.innerHTML = ServerRT.renderToString(server.SpreadButton, props).html;
		const button = container.querySelector('button')!;
		const text = Array.from(button.childNodes).find((node) => node.nodeType === 3);
		expect(button.textContent).toBe(expected);
		if (expected !== '') expect(text).toBeDefined();
		const root = hydrateRoot(container, SpreadButton, props);
		try {
			expect(container.querySelector('button')).toBe(button);
			expect(button.textContent).toBe(expected);
			if (text) expect(button.contains(text)).toBe(true);

			flushSync(() => root.render(SpreadButton, { children: 'Updated', title: 'client' }));
			expect(container.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('Updated');
			expect(button.title).toBe('client');
			if (text) {
				expect(button.contains(text)).toBe(true);
				expect(text.textContent).toBe('Updated');
			}

			for (const empty of ['', false, true, undefined, null]) {
				flushSync(() => root.render(SpreadButton, { children: empty }));
				expect(button.textContent).toBe('');
				flushSync(() => root.render(SpreadButton, { children: 0 }));
				expect(button.textContent).toBe('0');
			}
		} finally {
			root.unmount();
		}
		expect(container.innerHTML).toBe('');
	});

	it.each(['render', 'hydrate'] as const)(
		'keeps renderable mode changes, delegated events and cleanup live after %s',
		(mode) => {
			const originalClick = vi.fn();
			const updatedClick = vi.fn();
			const cleanup = vi.fn();
			const props = { children: 'Open', onClick: originalClick };
			if (mode === 'hydrate') {
				container.innerHTML = ServerRT.renderToString(server.SpreadButton, props).html;
			}
			const root =
				mode === 'hydrate' ? hydrateRoot(container, SpreadButton, props) : createRoot(container);
			if (mode === 'render') root.render(SpreadButton, props);
			const button = container.querySelector('button')!;
			try {
				expect(button.textContent).toBe('Open');
				flushSync(() => button.click());
				expect(originalClick).toHaveBeenCalledTimes(1);

				flushSync(() =>
					root.render(SpreadButton, {
						children: createElement('strong', null, 'Bold'),
						onClick: updatedClick,
					}),
				);
				const strong = button.querySelector('strong')!;
				expect(button.textContent).toBe('Bold');
				const click = new MouseEvent('click', { bubbles: true });
				flushSync(() => strong.dispatchEvent(click));
				expect(originalClick).toHaveBeenCalledTimes(1);
				expect(updatedClick).toHaveBeenCalledTimes(1);
				expect(updatedClick.mock.calls[0][0]).toBe(click);

				flushSync(() => root.render(SpreadButton, { children: 'Text' }));
				expect(button.textContent).toBe('Text');
				expect(strong.isConnected).toBe(false);
				flushSync(() => button.click());
				expect(updatedClick).toHaveBeenCalledTimes(1);

				flushSync(() =>
					root.render(SpreadButton, {
						children: ['Back ', createElement('em', { key: 'label' }, 'again')],
					}),
				);
				const emphasis = button.querySelector('em')!;
				expect(button.textContent).toBe('Back again');
				flushSync(() =>
					root.render(SpreadButton, {
						children: [createElement('em', { key: 'label' }, 'Again'), ' back'],
					}),
				);
				expect(button.textContent).toBe('Again back');
				expect(button.querySelector('em')).toBe(emphasis);

				flushSync(() => root.render(SpreadButton, { children: 'Text again' }));
				expect(button.textContent).toBe('Text again');
				expect(emphasis.isConnected).toBe(false);

				const componentProps = {
					children: createElement(StatefulLabel, { onCleanup: cleanup }),
					onClick: updatedClick,
				};
				flushSync(() => root.render(SpreadButton, componentProps));
				const label = button.querySelector('span')!;
				expect(button.textContent).toBe('Child 0');
				flushSync(() => label.click());
				expect(button.textContent).toBe('Child 1');
				expect(updatedClick).toHaveBeenCalledTimes(2);
				flushSync(() => root.render(SpreadButton, { ...componentProps, title: 'retained' }));
				expect(button.querySelector('span')).toBe(label);
				expect(button.textContent).toBe('Child 1');
				expect(cleanup).not.toHaveBeenCalled();

				flushSync(() => root.render(SpreadButton, { children: null }));
				expect(button.textContent).toBe('');
				expect(label.isConnected).toBe(false);
				expect(cleanup).toHaveBeenCalledTimes(1);
				flushSync(() => root.render(SpreadButton, componentProps));
				expect(button.textContent).toBe('Child 0');
				expect(container.querySelector('button')).toBe(button);
			} finally {
				root.unmount();
			}
			expect(cleanup).toHaveBeenCalledTimes(2);
			expect(container.innerHTML).toBe('');
			expect(button.isConnected).toBe(false);
		},
	);

	it('adopts spread-bearing siblings without replacing either host or text', () => {
		const props = { first: 'Open', second: 'Close' };
		container.innerHTML = ServerRT.renderToString(server.SpreadButtonPair, props).html;
		const buttons = Array.from(container.querySelectorAll('button'));
		const texts = buttons.map((button) =>
			Array.from(button.childNodes).find((node) => node.nodeType === 3),
		);
		const root = hydrateRoot(container, SpreadButtonPair, props);
		try {
			expect(container.textContent).toBe('OpenClose');
			flushSync(() => root.render(SpreadButtonPair, { first: 'First', second: 'Second' }));
			const updatedButtons = Array.from(container.querySelectorAll('button'));
			expect(buttons.map((button) => button.textContent)).toEqual(['First', 'Second']);
			for (let i = 0; i < buttons.length; i++) {
				expect(updatedButtons[i]).toBe(buttons[i]);
				expect(buttons[i].contains(texts[i]!)).toBe(true);
			}
		} finally {
			root.unmount();
		}
	});

	it('adopts a conditional primitive child and switches to and from an element', () => {
		const props = { on: false, label: 'first' };
		container.innerHTML = ServerRT.renderToString(server.ConditionalChild, props).html;
		const div = container.querySelector('div')!;
		const text = Array.from(div.childNodes).find((node) => node.nodeType === 3)!;
		expect(div.textContent).toBe('first');
		const root = hydrateRoot(container, ConditionalChild, props);
		try {
			expect(container.querySelector('div')).toBe(div);
			expect(div.textContent).toBe('first');
			expect(div.contains(text)).toBe(true);
			flushSync(() => root.render(ConditionalChild, { on: false, label: 'second' }));
			expect(div.textContent).toBe('second');
			expect(text.textContent).toBe('second');
			expect(div.contains(text)).toBe(true);
			flushSync(() => root.render(ConditionalChild, { on: true, label: 'second' }));
			const bold = div.querySelector('b')!;
			expect(div.textContent).toBe('yes');
			expect(text.isConnected).toBe(false);
			flushSync(() => root.render(ConditionalChild, { on: false, label: 'last' }));
			expect(div.textContent).toBe('last');
			expect(bold.isConnected).toBe(false);
			expect(container.querySelector('div')).toBe(div);
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])(
		'adopts mismatched spread text with suppressHydrationWarning=%s',
		(suppressHydrationWarning) => {
			const props = { children: 'Server', suppressHydrationWarning };
			container.innerHTML = ServerRT.renderToString(server.SpreadButton, props).html;
			const button = container.querySelector('button')!;
			const text = Array.from(button.childNodes).find((node) => node.nodeType === 3)!;
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			try {
				const root = hydrateRoot(container, SpreadButton, { ...props, children: 'Client' });
				try {
					flushSync(() => {});
					expect(button.textContent).toBe(suppressHydrationWarning ? 'Server' : 'Client');
					expect(button.contains(text)).toBe(true);
					if (suppressHydrationWarning) {
						expect(errors).not.toHaveBeenCalled();
					} else if (process.env.OCTANE_TEST_COMPILE_MODE !== 'prod') {
						expect(
							errors.mock.calls.some(([message]) => String(message).includes('hydration mismatch')),
						).toBe(true);
					}
					flushSync(() => root.render(SpreadButton, { ...props, children: 'Updated' }));
					expect(button.textContent).toBe('Updated');
					expect(button.contains(text)).toBe(true);
				} finally {
					root.unmount();
				}
			} finally {
				errors.mockRestore();
			}
		},
	);

	it.each(['', false, true, undefined, 'Open'])(
		'resumes children after raw HTML takes ownership of a hydrated host from %j',
		(children) => {
			container.innerHTML = ServerRT.renderToString(server.SpreadButton, { children }).html;
			const root = hydrateRoot(container, SpreadButton, { children });
			const button = container.querySelector('button')!;
			try {
				flushSync(() =>
					root.render(SpreadButton, {
						children: null,
						dangerouslySetInnerHTML: { __html: '<b>Raw</b>' },
					}),
				);
				expect(button.querySelector('b')?.textContent).toBe('Raw');
				flushSync(() => root.render(SpreadButton, { children: 'Back' }));
				expect(button.textContent).toBe('Back');
				expect(container.querySelector('button')).toBe(button);
			} finally {
				root.unmount();
			}
		},
	);

	for (const dev of [false, true]) {
		it(`preserves primitive transitions and context behind stable children (${dev ? 'dev' : 'prod'})`, () => {
			const source = `
				import { createContext, useContext, useState } from 'octane';
				const Theme = createContext('default');
				function Consumer() @{
					const theme = useContext(Theme);
					const [count, setCount] = useState(0);
					<button onClick={() => setCount(count + 1)}>{theme as string}{count as string}</button>
				}
				export const child = <Consumer />;
				export function App(props) @{
					<Theme.Provider value={props.theme}>
						<div>
							<output id="only">{props.value}</output>
							<p id="mixed">{'before:'}{props.value}{':after'}</p>
						</div>
					</Theme.Provider>
				}
			`;
			const compileOptions = { hmr: false, dev };
			const serverModule = loadCompiledFixtureSource(source, {
				id: 'stable-children.tsrx',
				mode: 'server',
				compileOptions,
			});
			const clientModule = loadCompiledFixtureSource(source, {
				id: 'stable-children.tsrx',
				mode: 'client',
				compileOptions,
			});
			container.innerHTML = ServerRT.renderToString(serverModule.App, {
				theme: 'light',
				value: 'first',
			}).html;
			const only = container.querySelector('#only')!;
			const mixed = container.querySelector('#mixed')!;
			const firstText = Array.from(only.childNodes).find((node) => node.nodeType === 3);
			const root = hydrateRoot(container, clientModule.App, { theme: 'light', value: 'first' });
			try {
				expect(container.querySelector('#only')).toBe(only);
				expect(container.querySelector('#mixed')).toBe(mixed);
				expect(Array.from(only.childNodes)).toContain(firstText);
				const update = (value: unknown, theme = 'light') => {
					flushSync(() => root.render(clientModule.App, { theme, value }));
				};
				update('second');
				expect(Array.from(only.childNodes)).toContain(firstText);
				expect(only.textContent).toBe('second');
				expect(mixed.textContent).toBe('before:second:after');
				for (const value of [true, false, null, undefined, '', 0, 4n, 'last']) {
					update(value);
					const text = value == null || typeof value === 'boolean' ? '' : String(value);
					expect(only.textContent).toBe(text);
					expect(mixed.textContent).toBe(`before:${text}:after`);
				}
				const children = ['array'];
				update(children);
				expect(only.textContent).toBe('array');
				children.push(' changed');
				update(children);
				expect(only.textContent).toBe('array changed');
				expect(mixed.textContent).toBe('before:array changed:after');
				update(clientModule.child);
				const onlyButton = only.querySelector('button')!;
				const mixedButton = mixed.querySelector('button')!;
				flushSync(() => onlyButton.click());
				expect(onlyButton.textContent).toBe('light1');
				expect(mixedButton.textContent).toBe('light0');
				// The same descriptor must still propagate its changed provider value.
				update(clientModule.child, 'dark');
				expect(only.querySelector('button')).toBe(onlyButton);
				expect(mixed.querySelector('button')).toBe(mixedButton);
				expect(onlyButton.textContent).toBe('dark1');
				expect(mixedButton.textContent).toBe('dark0');
				update('restored');
				expect(only.textContent).toBe('restored');
				expect(mixed.textContent).toBe('before:restored:after');
			} finally {
				root.unmount();
			}
		});
	}
});
