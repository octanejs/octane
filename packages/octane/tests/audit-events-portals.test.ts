import { describe, it, expect } from 'vitest';
import { createElement as h, createPortal, createRoot, flushSync } from '../src/index.js';
import * as React from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as flushReact } from 'react-dom';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const dev = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
function fixture(source: string) {
	return loadCompiledFixtureSource(source, {
		id: 'audit-events-portals.tsrx',
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});
}
function mouse(node: Element, type = 'click') {
	node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
}

describe('audit event and portal behavior', () => {
	it.each(['button', 'input', 'select', 'textarea'])(
		'skips disabled %s mouse handlers while ancestors receive events',
		(tag) => {
			const calls: string[] = [];
			const handler = () => calls.push('disabled');
			const props = {
				disabled: true,
				onClick: handler,
				onClickCapture: handler,
				onDoubleClick: handler,
				onMouseDown: handler,
				onMouseMove: handler,
				onMouseUp: handler,
			};
			const App = () => h('div', { onClick: () => calls.push('parent') }, h(tag, props));
			const r = mount(App);
			try {
				const control = r.find(tag);
				for (const type of ['click', 'dblclick', 'mousedown', 'mousemove', 'mouseup'])
					mouse(control, type);
				expect(calls).toEqual(['parent']);
				r.update(() => h('div', null, h(tag, { ...props, disabled: false })));
				mouse(r.find(tag));
				expect(calls).toEqual(['parent', 'disabled', 'disabled']);
			} finally {
				r.unmount();
			}
		},
	);

	it.each(['replacement', 'removal'])(
		'snapshots bubble handlers before a synchronous %s',
		(change) => {
			const calls: string[] = [];
			let r: ReturnType<typeof mount>;
			const oldParent = () => calls.push('old');
			const newParent = () => calls.push('new');
			const App = ({ parent }: { parent?: () => void }) =>
				h(
					'div',
					{ onClick: parent },
					h(
						'button',
						{
							onClick: () => {
								calls.push('child');
								r.update(App, { parent: change === 'replacement' ? newParent : undefined });
							},
						},
						'go',
					),
				);
			r = mount(App, { parent: oldParent });
			try {
				mouse(r.find('button'));
				expect(calls).toEqual(['child', 'old']);
				calls.length = 0;
				mouse(r.find('button'));
				expect(calls).toEqual(change === 'replacement' ? ['child', 'new'] : ['child']);
			} finally {
				r.unmount();
			}
		},
	);

	it('snapshots compiled handler bundle arguments and capture handlers', () => {
		const { App } = fixture(
			`export function App({log, change, label}) @{ <div onClick={() => log(label)} onClickCapture={change}><button onClick={change} onClickCapture={() => log(label)}>go</button></div> }`,
		);
		const calls: string[] = [];
		let r: ReturnType<typeof mount>;
		const log = (label: string) => calls.push(label);
		const change = () => r.update(App, { log, change, label: 'new' });
		r = mount(App, { log, change, label: 'old' });
		try {
			mouse(r.find('button'));
			// Capture and bubble are separate native phases. Capture keeps old;
			// bubble snapshots after the capture handler's explicit commit.
			expect(calls).toEqual(['old', 'new']);
		} finally {
			r.unmount();
		}
	});

	it.each(['compiled', 'spread', 'descriptor'])(
		'uses case-sensitive custom event names through %s props',
		(kind) => {
			const calls: string[] = [];
			const handler = () => calls.push('first');
			const source =
				kind === 'compiled'
					? `export function App({handler}) @{ <audit-control onFooBar={handler} onFooBarCapture={handler}/> }`
					: `export function App({handler}) @{ <audit-control {...{onFooBar: handler, onFooBarCapture: handler}}/> }`;
			const App =
				kind === 'descriptor'
					? ({ handler }: { handler?: () => void }) =>
							h('audit-control', { onFooBar: handler, onFooBarCapture: handler })
					: fixture(source).App;
			const r = mount(App, { handler });
			try {
				const control = r.find('audit-control');
				control.dispatchEvent(new Event('FooBar'));
				expect(calls).toEqual(['first', 'first']);
				control.dispatchEvent(new Event('foobar', { bubbles: true }));
				expect(calls).toHaveLength(2);
				r.update(App, { handler: () => calls.push('second') });
				control.dispatchEvent(new Event('FooBar'));
				expect(calls.slice(2)).toEqual(['second', 'second']);
				r.update(App, { handler: undefined });
				control.dispatchEvent(new Event('FooBar'));
				expect(calls).toHaveLength(4);
			} finally {
				r.unmount();
			}
		},
	);

	it('uses native focusin and focusout for authored focus handlers', () => {
		const { App } = fixture(
			`export function App({log}) @{ <div onFocus={() => log('parent')}><input onFocus={() => log('focus')} onBlur={() => log('blur')}/></div> }`,
		);
		const calls: string[] = [];
		const r = mount(App, { log: (label: string) => calls.push(label) });
		try {
			const input = r.find('input');
			input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
			input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
			expect(calls).toEqual(['focus', 'parent', 'blur']);
		} finally {
			r.unmount();
		}
	});

	it('captures a form action before submit handlers synchronously replace it', () => {
		const calls: string[] = [];
		let r: ReturnType<typeof mount>;
		const first = () => {
			calls.push('first');
		};
		const next = () => {
			calls.push('next');
		};
		const App = ({ action }: { action: () => void }) =>
			h(
				'form',
				{ action, onSubmit: () => r.update(App, { action: next }) },
				h('button', null, 'go'),
			);
		r = mount(App, { action: first });
		try {
			r.find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
			expect(calls).toEqual(['first']);
		} finally {
			r.unmount();
		}
	});

	it('intercepts a function form action installed through spread props after mount', () => {
		const calls: string[] = [];
		const { App } = fixture(
			`export function App(props: { form: Record<string, unknown> }) @{ <form {...props.form}><button>go</button></form> }`,
		);
		const r = mount(App, { form: { onSubmit: () => calls.push('submit') } });
		try {
			const submit = () => {
				const event = new Event('submit', { bubbles: true, cancelable: true });
				r.find('form').dispatchEvent(event);
				return event.defaultPrevented;
			};
			// Without a function action the submit stays native and only the
			// authored handler observes it.
			expect(submit()).toBe(false);
			expect(calls).toEqual(['submit']);
			r.update(App, {
				form: {
					onSubmit: () => calls.push('submit'),
					action: (data: FormData) => calls.push('action ' + (data instanceof FormData)),
				},
			});
			expect(submit()).toBe(true);
			expect(calls).toEqual(['submit', 'submit', 'action true']);
		} finally {
			r.unmount();
		}
	});

	it('matches custom-element nonbubbling event behavior with React', () => {
		function run(react: boolean) {
			const calls: string[] = [];
			const container = document.createElement('div');
			document.body.append(container);
			const element: (type: string, props: any, ...children: any[]) => any = react
				? React.createElement
				: h;
			const root = react ? createReactRoot(container) : createRoot(container);
			const flush = react ? flushReact : flushSync;
			flush(() =>
				root.render(
					element(
						'div',
						{ onToggle: () => calls.push('parent') },
						element('audit-control', {
							onToggle: () => calls.push('toggle'),
							onToggleCapture: () => calls.push('capture'),
						}),
					) as any,
				),
			);
			try {
				container.querySelector('audit-control')!.dispatchEvent(new Event('toggle'));
				return calls;
			} finally {
				flush(() => root.unmount());
				container.remove();
			}
		}
		expect(run(false)).toEqual(run(true));
	});

	it('matches nested-root capture order with React', () => {
		function run(react: boolean) {
			const calls: string[] = [];
			const rootContainer = document.createElement('div');
			document.body.append(rootContainer);
			const element: (type: string, props: any, ...children: any[]) => any = react
				? React.createElement
				: h;
			const makeRoot = react ? createReactRoot : createRoot;
			const flush = react ? flushReact : flushSync;
			const outer = makeRoot(rootContainer);
			const cb = (name: string) => () => calls.push(name);
			flush(() =>
				outer.render(
					element(
						'section',
						{ onClickCapture: cb('outer capture'), onClick: cb('outer bubble') },
						element('div', {
							id: 'inner-root',
							onClickCapture: cb('container capture'),
							onClick: cb('container bubble'),
						}),
					) as any,
				),
			);
			const inner = makeRoot(rootContainer.querySelector('#inner-root')!);
			flush(() =>
				inner.render(
					element(
						'button',
						{ onClickCapture: cb('inner capture'), onClick: cb('inner bubble') },
						'go',
					) as any,
				),
			);
			try {
				mouse(rootContainer.querySelector('button')!);
				return calls;
			} finally {
				flush(() => inner.unmount());
				flush(() => outer.unmount());
				rootContainer.remove();
			}
		}
		expect(run(false)).toEqual(run(true));
	});

	it('preserves portal child state for string and number keys across reorder', () => {
		const { Child } = fixture(
			`import { useState } from 'octane'; export function Child({label}) @{ const [initial] = useState(label); <input data-label={label} defaultValue={initial}/> }`,
		);
		const target = document.createElement('div');
		document.body.append(target);
		const App = ({ labels }: { labels: Array<string | number> }) =>
			labels.map((label) => createPortal(h(Child, { label: String(label) }), target, label));
		const r = mount(App, { labels: ['a', 2] });
		try {
			const a = target.querySelector('[data-label="a"]') as HTMLInputElement;
			const b = target.querySelector('[data-label="2"]') as HTMLInputElement;
			a.value = 'typed';
			r.update(App, { labels: [2, 'a'] });
			expect(target.querySelector('[data-label="a"]')).toBe(a);
			expect(target.querySelector('[data-label="2"]')).toBe(b);
			expect(a.value).toBe('typed');
		} finally {
			r.unmount();
			target.remove();
		}
	});

	it('remounts an authored direct portal when its key changes', () => {
		const { App } = fixture(
			`import { createPortal } from 'octane'; export function App({target, id}) @{ <div>{createPortal(<input defaultValue="fresh"/>, target, id)}</div> }`,
		);
		const target = document.createElement('div');
		document.body.append(target);
		const r = mount(App, { target, id: 'a' });
		try {
			const before = target.querySelector('input')!;
			before.value = 'typed';
			r.update(App, { target, id: 'a' });
			expect(target.querySelector('input')).toBe(before);
			r.update(App, { target, id: 'b' });
			expect(target.querySelector('input')).not.toBe(before);
			expect(target.querySelector('input')!.value).toBe('fresh');
		} finally {
			r.unmount();
			target.remove();
		}
	});
});
