import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ServerRT from 'octane/server';
import { mount, type MountResult } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import { FragmentInstance, flushSync, hydrateRoot } from '../src/index.js';
import {
	BodyRoot,
	DirectiveArms,
	HostChild,
	KeyedFragmentRef,
	KeyedSvg,
	ResetCaughtTry,
	ReturnedWithDirective,
	Unkeyed,
} from './_fixtures/template-keyed-fragment.tsrx';

// #1787: the template lowering inlined a keyed `<Fragment>`'s children and
// dropped its key, so a new key kept their state. Agents then reached for a
// single-item keyed `@for` to get the remount.

const FIXTURE = 'packages/octane/tests/_fixtures/template-keyed-fragment.tsrx';

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

function draft(r: MountResult, id: string): HTMLButtonElement {
	return r.find('#' + id) as HTMLButtonElement;
}

describe('keyed Fragment in a template', () => {
	it('keeps a host child Fragment for the same key and remounts it for a new key', () => {
		const r = mount(HostChild as any, { selected: 'a' });
		const first = draft(r, 'host-child');
		r.click('#host-child');
		expect(first.textContent).toBe('host-child: 1');

		r.update(HostChild as any, { selected: 'a' });
		expect(draft(r, 'host-child')).toBe(first);
		expect(first.textContent).toBe('host-child: 1');

		r.update(HostChild as any, { selected: 'b' });
		const next = draft(r, 'host-child');
		expect(next).not.toBe(first);
		expect(next.textContent).toBe('host-child: 0');
		expect(markup(r.find('section'))).toBe(
			'<b>before</b><button id="host-child">host-child: 0</button><i>b</i><b>after</b>',
		);
		r.unmount();
	});

	it('remounts a keyed Fragment at the root of a template body', () => {
		const r = mount(BodyRoot as any, { selected: 'a' });
		const first = draft(r, 'body-root');
		r.click('#body-root');
		r.update(BodyRoot as any, { selected: 'a' });
		expect(draft(r, 'body-root')).toBe(first);
		expect(first.textContent).toBe('body-root: 1');

		r.update(BodyRoot as any, { selected: 'b' });
		expect(draft(r, 'body-root')).not.toBe(first);
		expect(markup(r.container)).toBe('<button id="body-root">body-root: 0</button><i>b</i>');
		r.unmount();
	});

	it('remounts keyed Fragments inside @if and @try arms', () => {
		const r = mount(DirectiveArms as any, { selected: 'a', open: true });
		const ifArm = draft(r, 'if-arm');
		const tryArm = draft(r, 'try-arm');
		r.click('#if-arm');
		r.click('#try-arm');

		r.update(DirectiveArms as any, { selected: 'a', open: true });
		expect(draft(r, 'if-arm')).toBe(ifArm);
		expect(draft(r, 'try-arm')).toBe(tryArm);
		expect(tryArm.textContent).toBe('try-arm: 1');

		r.update(DirectiveArms as any, { selected: 'b', open: true });
		expect(draft(r, 'if-arm')).not.toBe(ifArm);
		expect(draft(r, 'try-arm')).not.toBe(tryArm);
		expect(markup(r.find('section'))).toBe(
			'<button id="if-arm">if-arm: 0</button><button id="try-arm">try-arm: 0</button>',
		);
		r.unmount();
	});

	it('clears a caught @try when the keyed Fragment around it changes key', () => {
		const r = mount(ResetCaughtTry as any, { selected: 'broken' });
		expect(r.find('#caught').textContent).toBe('failed to load');

		r.update(ResetCaughtTry as any, { selected: 'working' });
		expect(markup(r.find('section'))).toBe('<button id="loaded">loaded: 0</button>');
		r.unmount();
	});

	it('keeps the key on a Fragment with directive children in returned JSX', () => {
		const r = mount(ReturnedWithDirective as any, { selected: 'a', open: true });
		const first = draft(r, 'returned-directive');
		r.click('#returned-directive');
		r.update(ReturnedWithDirective as any, { selected: 'a', open: true });
		expect(draft(r, 'returned-directive')).toBe(first);

		r.update(ReturnedWithDirective as any, { selected: 'b', open: true });
		expect(draft(r, 'returned-directive')).not.toBe(first);
		expect(draft(r, 'returned-directive').textContent).toBe('returned-directive: 0');
		r.unmount();
	});

	it('attaches a ref to a keyed Fragment and remounts it for a new key', () => {
		const fragmentRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(KeyedFragmentRef as any, { selected: 'a', fragmentRef });
		const first = draft(r, 'fragment-ref');
		const instance = fragmentRef.current;
		expect(instance).toBeInstanceOf(FragmentInstance);

		r.update(KeyedFragmentRef as any, { selected: 'b', fragmentRef });
		expect(draft(r, 'fragment-ref')).not.toBe(first);
		expect(fragmentRef.current).toBeInstanceOf(FragmentInstance);
		expect(fragmentRef.current).not.toBe(instance);
		r.unmount();
		expect(fragmentRef.current).toBeNull();
	});

	it('keeps SVG children in the SVG namespace across a remount', () => {
		const r = mount(KeyedSvg as any, { selected: 'a' });
		const first = r.find('circle');
		r.update(KeyedSvg as any, { selected: 'bb' });
		const next = r.find('circle');
		expect(next).not.toBe(first);
		expect(next.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(next.getAttribute('r')).toBe('2');
		r.unmount();
	});

	it('leaves an unkeyed Fragment transparent', () => {
		const r = mount(Unkeyed as any, { selected: 'a' });
		const first = draft(r, 'unkeyed');
		r.click('#unkeyed');
		r.update(Unkeyed as any, { selected: 'b' });
		expect(draft(r, 'unkeyed')).toBe(first);
		expect(markup(r.find('section'))).toBe('<button id="unkeyed">unkeyed: 1</button><i>b</i>');
		r.unmount();
	});
});

describe('keyed Fragment in a template: server render and hydration', () => {
	let warn: ReturnType<typeof vi.spyOn>;
	let error: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		error = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		warn.mockRestore();
		error.mockRestore();
	});

	const CASES = [
		{
			name: 'HostChild',
			client: HostChild,
			props: { selected: 'a' },
			id: 'host-child',
			markup:
				'<section><b>before</b><button id="host-child">host-child: 0</button><i>a</i><b>after</b></section>',
		},
		{
			name: 'BodyRoot',
			client: BodyRoot,
			props: { selected: 'a' },
			id: 'body-root',
			markup: '<button id="body-root">body-root: 0</button><i>a</i>',
		},
		{
			name: 'DirectiveArms',
			client: DirectiveArms,
			props: { selected: 'a', open: true },
			id: 'try-arm',
			markup:
				'<section><button id="if-arm">if-arm: 0</button><button id="try-arm">try-arm: 0</button></section>',
		},
	];

	for (const { name, client, props, id, markup: expected } of CASES) {
		it(`adopts the server nodes of ${name} and remounts them for a new key`, () => {
			const server = loadServerFixture(FIXTURE);
			const { html } = ServerRT.renderToString(server[name], props);
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = html;
			expect(markup(container)).toBe(expected);
			const serverDraft = container.querySelector('#' + id) as HTMLButtonElement;

			const recoverable: unknown[] = [];
			const root = hydrateRoot(container, client as any, props, {
				onRecoverableError: (err: unknown) => recoverable.push(err),
			});
			flushSync(() => {});
			expect(recoverable).toEqual([]);
			expect(warn).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
			expect(container.querySelector('#' + id)).toBe(serverDraft);
			flushSync(() => serverDraft.click());
			expect(serverDraft.textContent).toBe(`${id}: 1`);

			root.render(client as any, props);
			flushSync(() => {});
			expect(container.querySelector('#' + id)).toBe(serverDraft);

			root.render(client as any, { ...props, selected: 'b' });
			flushSync(() => {});
			const next = container.querySelector('#' + id);
			expect(next).not.toBe(serverDraft);
			expect(next?.textContent).toBe(`${id}: 0`);
			root.unmount();
			container.remove();
		});
	}
});
