import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { createRoot, hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { Card, Wrap, Clicky, Bare, Doc, Overridable } from './_fixtures/host-string-tag.tsrx';

// Template-position dynamic tags that resolve to a HOST tag STRING at runtime
// (`<props.parts.title>`, `<Tag/>` with `const Tag = 'h1'`). These lower to
// componentSlot; the runtime renders the string comp as a host element via the
// de-opt host machinery (hostElementBody) — mirroring the server's
// `<!--[--><tag>…children block…</tag><!--]-->` emission so hydration adopts.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/host-string-tag.tsrx',
);
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'host-string-tag.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

function mount(body: any, props?: any) {
	const root = createRoot(container);
	root.render(body, props);
	flushSync(() => {});
	return root;
}

describe('host string tags — client mount', () => {
	it('renders a member-expression tag as a host element with props + text child', () => {
		const root = mount(Card, { parts: { title: 'h1' }, text: 'Hi', klass: 'big' });
		const t = container.querySelector('#card > h1#t') as HTMLElement;
		expect(t).not.toBeNull();
		expect(t.textContent).toBe('Hi');
		expect(t.className).toBe('big');
		root.unmount();
	});

	it('renders a component child inside a variable host tag, interactive', () => {
		const root = mount(Wrap, { tag: 'article' });
		const btn = container.querySelector('#wrap > article#inner button#counter')!;
		expect(btn.textContent).toBe('count:0');
		flushSync(() => (btn as HTMLButtonElement).click());
		expect(btn.textContent).toBe('count:1');
		root.unmount();
	});

	it('renders a childless dynamic tag', () => {
		const root = mount(Bare, { tag: 'hr' });
		expect(container.querySelector('#bare > hr')).not.toBeNull();
		root.unmount();
	});

	it('fires delegated events and attaches/detaches the ref on the dynamic tag', () => {
		const seen: (Element | null)[] = [];
		let picked = 0;
		const root = mount(Clicky, {
			tag: 'button',
			tagRef: (el: Element | null) => seen.push(el),
			onPick: () => picked++,
		});
		const btn = container.querySelector('#cl > button#btn') as HTMLButtonElement;
		expect(seen).toEqual([btn]);
		flushSync(() => btn.click());
		expect(picked).toBe(1);
		root.unmount();
		expect(seen).toEqual([btn, null]);
	});
});

describe('host string tags — updates', () => {
	it('same tag string → patches the SAME element in place (props + text)', () => {
		const root = createRoot(container);
		root.render(Card, { parts: { title: 'h1' }, text: 'a', klass: 'x' });
		flushSync(() => {});
		const el = container.querySelector('#t') as HTMLElement;
		expect(el.tagName).toBe('H1');
		root.render(Card, { parts: { title: 'h1' }, text: 'b', klass: 'y' });
		flushSync(() => {});
		expect(container.querySelector('#t')).toBe(el); // reused, not remounted
		expect(el.textContent).toBe('b');
		expect(el.className).toBe('y');
		root.unmount();
	});

	it('tag flip h1 → h2 → remounts the element (fresh children state)', () => {
		const root = createRoot(container);
		root.render(Wrap, { tag: 'h1' });
		flushSync(() => {});
		const btn = container.querySelector('#wrap > h1 #counter') as HTMLButtonElement;
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('count:1');
		root.render(Wrap, { tag: 'h2' });
		flushSync(() => {});
		expect(container.querySelector('#wrap > h1')).toBeNull();
		const btn2 = container.querySelector('#wrap > h2 #counter') as HTMLButtonElement;
		expect(btn2).not.toBe(btn);
		// React element-type semantics: the children remounted with fresh state.
		expect(btn2.textContent).toBe('count:0');
		root.unmount();
	});

	it('flips string → component → string', () => {
		const AsComp = (props: any, scope: any) => {
			// A plain runtime component: render its children body directly.
			(props.children as any)(undefined, scope, undefined);
		};
		const root = createRoot(container);
		root.render(Card, { parts: { title: 'em' }, text: 'x' });
		flushSync(() => {});
		expect(container.querySelector('#card > em#t')).not.toBeNull();
		root.render(Card, { parts: { title: AsComp }, text: 'x' });
		flushSync(() => {});
		// The component renders only the children text — no host wrapper.
		expect(container.querySelector('#card > em')).toBeNull();
		expect(container.querySelector('#card')!.textContent).toBe('x');
		root.render(Card, { parts: { title: 'strong' }, text: 'x' });
		flushSync(() => {});
		expect(container.querySelector('#card > strong#t')!.textContent).toBe('x');
		root.unmount();
	});

	it('moves a ref between elements on tag flip', () => {
		const log: (string | null)[] = [];
		const ref = (el: Element | null) => log.push(el === null ? null : el.tagName);
		const root = createRoot(container);
		root.render(Clicky, { tag: 'b', tagRef: ref, onPick: () => {} });
		flushSync(() => {});
		expect(log).toEqual(['B']);
		root.render(Clicky, { tag: 'i', tagRef: ref, onPick: () => {} });
		flushSync(() => {});
		expect(log).toEqual(['B', null, 'I']);
		root.unmount();
	});
});

describe('host string tags — hydration', () => {
	it('SSR emits the host element inside one component block range', async () => {
		const { html } = await ServerRT.renderToString(server.Card, {
			parts: { title: 'h1' },
			text: 'Hi',
			klass: 'big',
		});
		// One component block range wraps the host element; the children render-fn
		// output carries its own inner block (the shape hostElementBody's childSlot
		// adopts on the client).
		expect(html).toContain(
			'<div id="card"><!--[--><h1 id="t" class="big"><!--[-->Hi<!--]--></h1><!--]--></div>',
		);
	});

	it('adopts the server host element + text (no rebuild)', async () => {
		const props = { parts: { title: 'h1' }, text: 'Hi', klass: 'big' };
		const { html } = await ServerRT.renderToString(server.Card, props);
		container.innerHTML = html;
		const el = container.querySelector('#t') as HTMLElement;
		const root = hydrateRoot(container, Card, props);
		flushSync(() => {});
		expect(container.querySelector('#t')).toBe(el); // adopted, not rebuilt
		expect(el.textContent).toBe('Hi');
		root.unmount();
	});

	it('adopts a component child inside the dynamic host and keeps it interactive', async () => {
		const { html } = await ServerRT.renderToString(server.Wrap, { tag: 'article' });
		expect(html).toContain('count:0');
		container.innerHTML = html;
		const inner = container.querySelector('#inner') as HTMLElement;
		const btn = container.querySelector('#counter') as HTMLButtonElement;
		const root = hydrateRoot(container, Wrap, { tag: 'article' });
		flushSync(() => {});
		expect(container.querySelector('#inner')).toBe(inner); // adopted host element
		expect(container.querySelector('#counter')).toBe(btn); // adopted component DOM
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('count:1');
		root.unmount();
	});

	it('attaches the ref + events to the ADOPTED element', async () => {
		const seen: (Element | null)[] = [];
		let picked = 0;
		const { html } = await ServerRT.renderToString(server.Clicky, { tag: 'button' });
		container.innerHTML = html;
		const btn = container.querySelector('#btn') as HTMLButtonElement;
		const root = hydrateRoot(container, Clicky, {
			tag: 'button',
			tagRef: (el: Element | null) => seen.push(el),
			onPick: () => picked++,
		});
		flushSync(() => {});
		expect(seen).toEqual([btn]);
		flushSync(() => btn.click());
		expect(picked).toBe(1);
		root.unmount();
	});

	it('updates after hydration: same-tag patch, then tag flip remount', async () => {
		const { html } = await ServerRT.renderToString(server.Card, {
			parts: { title: 'h1' },
			text: 'a',
			klass: 'x',
		});
		container.innerHTML = html;
		const el = container.querySelector('#t') as HTMLElement;
		const root = hydrateRoot(container, Card, { parts: { title: 'h1' }, text: 'a', klass: 'x' });
		flushSync(() => {});
		root.render(Card, { parts: { title: 'h1' }, text: 'b', klass: 'y' });
		flushSync(() => {});
		expect(container.querySelector('#t')).toBe(el); // adopted element patched in place
		expect(el.textContent).toBe('b');
		expect(el.className).toBe('y');
		root.render(Card, { parts: { title: 'h3' }, text: 'c', klass: 'y' });
		flushSync(() => {});
		expect(container.querySelector('#card > h3#t')!.textContent).toBe('c');
		expect(container.querySelector('#card > h1')).toBeNull();
		root.unmount();
	});

	it('hydrates a childless dynamic (void) tag', async () => {
		const { html } = await ServerRT.renderToString(server.Bare, { tag: 'hr' });
		container.innerHTML = html;
		const hr = container.querySelector('#bare > hr');
		expect(hr).not.toBeNull();
		const root = hydrateRoot(container, Bare, { tag: 'hr' });
		flushSync(() => {});
		expect(container.querySelector('#bare > hr')).toBe(hr);
		root.unmount();
	});
});

describe('host string tags — value position (.tsx return, the MDX shape) hydration', () => {
	it('hydrates a document of string member tags with the content intact', async () => {
		const props = { components: { h1: 'h1', p: 'p' }, title: 'Hello' };
		const { html } = ServerRT.renderToString(server.Doc, props);
		expect(html).toContain('<h1 class="title">Hello</h1>');
		expect(html).toContain('<p>body text</p>');

		container.innerHTML = html;
		const root = hydrateRoot(container, Doc, props);
		flushSync(() => {});
		const h1 = container.querySelector('h1') as HTMLElement;
		expect(h1).not.toBeNull();
		expect(h1.textContent).toBe('Hello');
		expect(h1.className).toBe('title');
		expect((container.querySelector('p') as HTMLElement).textContent).toBe('body text');
		root.unmount();
	});

	it('hydrates the string variant of an overridable tag site', async () => {
		const props = { useFancy: false };
		const { html } = ServerRT.renderToString(server.Overridable, props);
		expect(html).toContain('<h2>Title</h2>');

		container.innerHTML = html;
		const root = hydrateRoot(container, Overridable, props);
		flushSync(() => {});
		expect((container.querySelector('h2') as HTMLElement).textContent).toBe('Title');
		root.unmount();
	});

	it('hydrates the component variant of the same site with no mismatch', async () => {
		const props = { useFancy: true };
		const { html } = ServerRT.renderToString(server.Overridable, props);
		expect(html).toContain('<em class="fancy">Title</em>');

		container.innerHTML = html;
		const before = container.innerHTML;
		const root = hydrateRoot(container, Overridable, props);
		flushSync(() => {});
		expect(container.innerHTML).toBe(before); // component path: adopted, untouched
		root.unmount();
	});
});
