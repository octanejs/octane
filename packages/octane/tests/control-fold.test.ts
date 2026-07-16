import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import { FragmentInstance, hydrateRoot, flushSync } from '../src/index.js';
import {
	RetToggle,
	AtToggle,
	ReturnedMailbox,
	ReturnedDashboard,
	ReturnedProviderMailbox,
	EvaluationPanel,
	ReturnedMemberEvaluationOrder,
	ReturnedActivityMailbox,
	DirectReturnedActivityMailbox,
	ReturnedHeadMailbox,
	DirectReturnedTitle,
	DirectReturnedMeta,
	DirectReturnedLink,
	ReturnedKeyedFragmentBoundary,
	DirectReturnedKeyedFragmentBoundary,
	DescriptorHostWithKeyedFragment,
	DescriptorHostWithKeyedComponents,
	ReturnedChildCodeBlock,
} from './_fixtures/control-fold.tsrx';
import {
	DirectReturnedFragmentRefMailbox,
	ReturnedFragmentRefMailbox,
} from './_fixtures/control-fold-fragment-ref.tsrx';
import { Count as RetCount } from './_fixtures/return-count.tsrx';
import { AtBraceCount } from './_fixtures/atbrace-count.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/control-fold.tsrx';
function serverModule(): Record<string, any> {
	return loadServerFixture(FIXTURE);
}

// Stage 1 of the @{} fold: a return-JSX host element containing `@if` folds to the
// return-based fragment model. The fold's contract is that it produces DOM
// byte-identical to the inline `@{}` form (AtToggle) and updates identically — the
// `@{}` form is the oracle. (Selectors use the tag/class, not the shared `id="hit"`,
// to avoid a jsdom duplicate-id quirk when both components are mounted at once.)
describe('folded @if (return-JSX) matches the inline @{} oracle', () => {
	it('byte-equal DOM on mount (taken branch)', () => {
		const a = mount(RetToggle as any, { on: true });
		const b = mount(AtToggle as any, { on: true });
		expect(a.html()).toBe(b.html());
		expect(a.find('button').textContent).toBe('on:0');
		a.unmount();
		b.unmount();
	});

	it('byte-equal DOM on the @else branch', () => {
		const a = mount(RetToggle as any, { on: false });
		const b = mount(AtToggle as any, { on: false });
		expect(a.html()).toBe(b.html());
		expect(a.find('.off').textContent).toBe('off');
		a.unmount();
		b.unmount();
	});

	it('the folded branch is interactive and updates like the oracle', () => {
		const a = mount(RetToggle as any, { on: true });
		a.click('button');
		expect(a.find('button').textContent).toBe('on:1');
		a.unmount();

		// Same observable update as the inline oracle (mounted separately to avoid
		// the duplicate-id quirk).
		const b = mount(AtToggle as any, { on: true });
		b.click('button');
		expect(b.find('button').textContent).toBe('on:1');
		b.unmount();
	});
});

// The fold's hydration proof: the folded return-JSX form must SSR byte-identically
// to the inline `@{}` form (so the server markup is the same) AND the client must
// adopt that markup (not rebuild) — the extra markerless `__ret`/`_frag` layer must
// not desync the hydration cursor.
describe('folded @if hydrates against the @{} oracle markup', () => {
	it('SSR of the folded form byte-equals the inline form', async () => {
		const server = serverModule();
		const ret = await ServerRT.renderToString(server.RetToggle, { on: true });
		const at = await ServerRT.renderToString(server.AtToggle, { on: true });
		expect(ret.html).toBe(at.html);
		expect(ret.html).toContain('on:0');
	});

	it('adopts the server-rendered branch and stays interactive', async () => {
		const server = serverModule();
		const { html } = await ServerRT.renderToString(server.RetToggle, { on: true });
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const btn = container.querySelector('button') as HTMLButtonElement;
		const root = hydrateRoot(container, RetToggle, { on: true });
		flushSync(() => {});
		expect(container.querySelector('button')).toBe(btn); // adopted, not rebuilt
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('on:1'); // handler is live on the adopted node
		root.unmount();
		container.remove();
	});
});

describe('template directives in a returned fragment', () => {
	const drafts = [
		{ id: 'a', subject: 'A thoughtful next step' },
		{ id: 'b', subject: 'Release notes' },
	];

	it('renders and updates top-level control flow with a nested keyed list', () => {
		const r = mount(ReturnedMailbox as any, { drafts });
		expect(r.find('#drafts h2').textContent).toBe('Saved drafts');
		expect(r.findAll('.draft').map((row) => row.textContent)).toEqual([
			'A thoughtful next step',
			'Release notes',
		]);

		r.click('#folder-toggle');
		expect(r.find('#sent h2').textContent).toBe('Sent mail');
		expect(r.findAll('.draft')).toHaveLength(0);

		r.click('#folder-toggle');
		expect(r.findAll('.draft').map((row) => row.getAttribute('data-id'))).toEqual(['a', 'b']);
		r.update(ReturnedMailbox as any, { drafts: [] });
		expect(r.find('#empty-drafts').textContent).toBe('No saved drafts');
		r.unmount();
	});

	it('server-renders the selected arm and hydrates it in place', () => {
		const server = serverModule();
		const { html } = ServerRT.renderToString(server.ReturnedMailbox, { drafts });
		expect(html).toContain('Saved drafts');
		expect(html).toContain('A thoughtful next step');

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const toolbar = container.querySelector('#folder-toggle');
		const firstDraft = container.querySelector('[data-id="a"]');
		const root = hydrateRoot(container, ReturnedMailbox, { drafts });
		flushSync(() => {});
		expect(container.querySelector('#folder-toggle')).toBe(toolbar);
		expect(container.querySelector('[data-id="a"]')).toBe(firstDraft);

		flushSync(() => (toolbar as HTMLButtonElement).click());
		expect(container.querySelector('#sent h2')?.textContent).toBe('Sent mail');
		expect(container.querySelector('#drafts')).toBeNull();
		root.unmount();
		container.remove();
	});

	it('keeps sibling switch, list, and error-boundary directives live', () => {
		const r = mount(ReturnedDashboard as any, {
			folder: 'inbox',
			events: [
				{ id: 'accepted', label: 'Accepted by server' },
				{ id: 'delivered', label: 'Delivered' },
			],
			failed: false,
		});
		const title = r.find('#dashboard-title');
		expect(r.find('#folder-summary').textContent).toBe('Inbox activity');
		expect(r.findAll('.delivery-event').map((event) => event.textContent)).toEqual([
			'Accepted by server',
			'Delivered',
		]);
		expect(r.find('#delivery-summary').textContent).toBe('Ready: 2');

		r.update(ReturnedDashboard as any, { folder: 'sent', events: [], failed: true });
		expect(r.find('#dashboard-title')).toBe(title);
		expect(r.find('#folder-summary').textContent).toBe('Sent activity');
		expect(r.find('#empty-events').textContent).toBe('No delivery events');
		expect(r.find('#summary-error').textContent).toBe('Summary unavailable');
		r.unmount();
	});

	it('hydrates directive children nested under a context Provider', () => {
		const server = serverModule();
		const props = { folder: 'drafts', show: true };
		const { html } = ServerRT.renderToString(server.ReturnedProviderMailbox, props);
		expect(html).toContain('Current: drafts');

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const title = container.querySelector('#provider-title');
		const mailbox = container.querySelector('#current-mailbox');
		const root = hydrateRoot(container, ReturnedProviderMailbox, props);
		flushSync(() => {});
		expect(container.querySelector('#provider-title')).toBe(title);
		expect(container.querySelector('#current-mailbox')).toBe(mailbox);

		root.render(ReturnedProviderMailbox, { folder: 'sent', show: true });
		flushSync(() => {});
		expect(container.querySelector('#current-mailbox')?.textContent).toBe('Current: sent');
		root.render(ReturnedProviderMailbox, { folder: 'sent', show: false });
		flushSync(() => {});
		expect(container.querySelector('#current-mailbox')).toBeNull();
		expect(container.querySelector('#no-mailbox')?.textContent).toBe('No mailbox selected');
		root.unmount();
		container.remove();
	});

	it('evaluates a member component tag before its props and directive children', () => {
		const order: string[] = [];
		const widgets = {
			get Panel() {
				order.push('tag');
				return EvaluationPanel;
			},
		};
		const observe = (phase: string) => {
			order.push(phase);
			return phase === 'condition' ? true : 'mail';
		};

		const r = mount(ReturnedMemberEvaluationOrder as any, { widgets, observe });
		expect(order.slice(0, 3)).toEqual(['tag', 'prop', 'condition']);
		expect(r.find('#evaluation-panel').getAttribute('data-label')).toBe('mail');
		expect(r.find('#evaluation-child').textContent).toBe('Condition active');
		r.unmount();
	});

	it('hides and reveals Activity children without replacing their stateful DOM', () => {
		const r = mount(ReturnedActivityMailbox as any, { mode: 'visible' });
		const draft = r.find('#activity-draft') as HTMLElement;
		r.click('#activity-draft');
		expect(draft.textContent).toBe('Draft edits: 1');

		r.update(ReturnedActivityMailbox as any, { mode: 'hidden' });
		expect(r.find('#activity-draft')).toBe(draft);
		expect(draft.style.display).toBe('none');
		expect(r.find('#activity-tail').textContent).toBe('Mailbox ready');

		r.update(ReturnedActivityMailbox as any, { mode: 'visible' });
		expect(r.find('#activity-draft')).toBe(draft);
		expect(draft.style.display).toBe('');
		expect(draft.textContent).toBe('Draft edits: 1');
		r.unmount();
	});

	it('server-renders and hydrates returned-fragment Activity content in place', () => {
		const server = serverModule();
		const props = { mode: 'visible' };
		const { html } = ServerRT.renderToString(server.ReturnedActivityMailbox, props);
		expect(html).toContain('Focused draft');
		expect(html).toContain('Draft edits: 0');
		expect(html).toContain('Mailbox ready');

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const title = container.querySelector('#activity-title');
		const draft = container.querySelector('#activity-draft') as HTMLButtonElement;
		const tail = container.querySelector('#activity-tail');
		const root = hydrateRoot(container, ReturnedActivityMailbox, props);
		flushSync(() => {});
		expect(container.querySelector('#activity-title')).toBe(title);
		expect(container.querySelector('#activity-draft')).toBe(draft);
		expect(container.querySelector('#activity-tail')).toBe(tail);

		flushSync(() => draft.click());
		expect(draft.textContent).toBe('Draft edits: 1');
		root.render(ReturnedActivityMailbox, { mode: 'hidden' });
		flushSync(() => {});
		expect(container.querySelector('#activity-draft')).toBe(draft);
		expect(draft.style.display).toBe('none');
		root.render(ReturnedActivityMailbox, { mode: 'visible' });
		flushSync(() => {});
		expect(container.querySelector('#activity-draft')).toBe(draft);
		expect(draft.style.display).toBe('');
		expect(draft.textContent).toBe('Draft edits: 1');
		root.unmount();
		container.remove();
	});

	it('updates a directly returned Activity and evaluates its mode before its children', () => {
		const order: string[] = [];
		const observe = (phase: string, value: unknown) => {
			order.push(phase);
			return value;
		};
		const r = mount(DirectReturnedActivityMailbox as any, {
			mode: 'visible',
			observe,
		});
		expect(order.slice(0, 2)).toEqual(['mode', 'child']);
		const draft = r.find('#direct-activity-draft') as HTMLElement;
		r.click('#direct-activity-draft');
		expect(draft.textContent).toBe('Direct edits: 1');

		r.update(DirectReturnedActivityMailbox as any, { mode: 'hidden', observe });
		expect(r.find('#direct-activity-draft')).toBe(draft);
		expect(draft.style.display).toBe('none');
		r.update(DirectReturnedActivityMailbox as any, { mode: 'visible', observe });
		expect(r.find('#direct-activity-draft')).toBe(draft);
		expect(draft.style.display).toBe('');
		expect(draft.textContent).toBe('Direct edits: 1');
		r.unmount();
	});

	it('server-renders and hydrates a multi-root directly returned Activity', () => {
		const server = serverModule();
		const observe = (_phase: string, value: unknown) => value;
		const props = { mode: 'visible', observe };
		const { html } = ServerRT.renderToString(server.DirectReturnedActivityMailbox, props);
		expect(html).toContain('Direct focused draft');
		expect(html).toContain('Direct edits: 0');
		expect(html).toContain('Direct mailbox ready');

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const title = container.querySelector('#direct-activity-title');
		const draft = container.querySelector('#direct-activity-draft') as HTMLButtonElement;
		const tail = container.querySelector('#direct-activity-tail');
		const root = hydrateRoot(container, DirectReturnedActivityMailbox, props);
		flushSync(() => {});
		expect(container.querySelector('#direct-activity-title')).toBe(title);
		expect(container.querySelector('#direct-activity-draft')).toBe(draft);
		expect(container.querySelector('#direct-activity-tail')).toBe(tail);

		flushSync(() => draft.click());
		expect(draft.textContent).toBe('Direct edits: 1');
		root.render(DirectReturnedActivityMailbox, { mode: 'hidden', observe });
		flushSync(() => {});
		expect(container.querySelector('#direct-activity-draft')).toBe(draft);
		expect(draft.style.display).toBe('none');
		root.render(DirectReturnedActivityMailbox, { mode: 'visible', observe });
		flushSync(() => {});
		expect(container.querySelector('#direct-activity-draft')).toBe(draft);
		expect(draft.style.display).toBe('');
		expect(draft.textContent).toBe('Direct edits: 1');
		root.unmount();
		container.remove();
	});

	it('keeps a long-form Fragment ref and stateful children stable across updates', () => {
		const groupRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(ReturnedFragmentRefMailbox as any, { groupRef, title: 'Inbox drafts' });
		const fragment = groupRef.current;
		const draft = r.find('#fragment-draft');
		expect(fragment).toBeInstanceOf(FragmentInstance);

		r.click('#fragment-draft');
		expect(draft.textContent).toBe('Grouped edits: 1');
		r.update(ReturnedFragmentRefMailbox as any, { groupRef, title: 'Sent drafts' });
		expect(groupRef.current).toBe(fragment);
		expect(r.find('#fragment-draft')).toBe(draft);
		expect(draft.textContent).toBe('Grouped edits: 1');
		expect(r.find('#fragment-ref-title').textContent).toBe('Sent drafts');
		r.unmount();
		expect(groupRef.current).toBeNull();
	});

	it('keeps a directly returned multi-root Fragment ref stable across updates', () => {
		const groupRef: { current: FragmentInstance | null } = { current: null };
		const order: string[] = [];
		const observe = (phase: string, value: unknown) => {
			order.push(phase);
			return value;
		};
		const r = mount(DirectReturnedFragmentRefMailbox as any, {
			groupRef,
			title: 'Direct inbox drafts',
			observe,
		});
		expect(order.slice(0, 2)).toEqual(['ref', 'child']);
		const fragment = groupRef.current;
		const title = r.find('#direct-fragment-title');
		const draft = r.find('#direct-fragment-draft');
		const tail = r.find('#direct-fragment-tail');
		expect(fragment).toBeInstanceOf(FragmentInstance);

		r.click('#direct-fragment-draft');
		expect(draft.textContent).toBe('Direct grouped edits: 1');
		r.update(DirectReturnedFragmentRefMailbox as any, {
			groupRef,
			title: 'Direct sent drafts',
			observe,
		});
		expect(groupRef.current).toBe(fragment);
		expect(r.find('#direct-fragment-title')).toBe(title);
		expect(r.find('#direct-fragment-draft')).toBe(draft);
		expect(r.find('#direct-fragment-tail')).toBe(tail);
		expect(title.textContent).toBe('Direct sent drafts');
		expect(draft.textContent).toBe('Direct grouped edits: 1');
		r.unmount();
		expect(groupRef.current).toBeNull();
	});

	it('rejects nested and direct returned Fragment refs during server compilation', () => {
		expect(() =>
			compile(
				`export function Nested(p) { return <><Fragment ref={p.ref}><span>nested</span></Fragment></>; }`,
				'returned-nested-fragment-ref.tsrx',
				{ mode: 'server' },
			),
		).toThrow(/does not support fragment refs/);
		expect(() =>
			compile(
				`export function Direct(p) { return <Fragment ref={p.ref}><span>direct</span></Fragment>; }`,
				'returned-direct-fragment-ref.tsrx',
				{ mode: 'server' },
			),
		).toThrow(/does not support fragment refs/);
	});

	it('retains an ordinary keyed Fragment descriptor boundary', () => {
		const r = mount(ReturnedKeyedFragmentBoundary as any, { fragmentKey: 'drafts' });
		const firstDraft = r.find('#keyed-fragment-draft');
		r.click('#keyed-fragment-draft');
		expect(firstDraft.textContent).toBe('Keyed edits: 1');

		r.update(ReturnedKeyedFragmentBoundary as any, { fragmentKey: 'drafts' });
		expect(r.find('#keyed-fragment-draft')).toBe(firstDraft);
		expect(firstDraft.textContent).toBe('Keyed edits: 1');

		r.update(ReturnedKeyedFragmentBoundary as any, { fragmentKey: 'sent' });
		const remountedDraft = r.find('#keyed-fragment-draft');
		expect(remountedDraft).not.toBe(firstDraft);
		expect(remountedDraft.textContent).toBe('Keyed edits: 0');
		r.unmount();
	});

	it('server-renders and hydrates a keyed Fragment descriptor boundary', () => {
		const server = serverModule();
		const props = { fragmentKey: 'drafts' };
		const { html } = ServerRT.renderToString(server.ReturnedKeyedFragmentBoundary, props);
		expect(html).toContain('Keyed edits: 0');

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const firstDraft = container.querySelector('#keyed-fragment-draft') as HTMLButtonElement;
		const root = hydrateRoot(container, ReturnedKeyedFragmentBoundary, props);
		flushSync(() => {});
		expect(container.querySelector('#keyed-fragment-draft')).toBe(firstDraft);
		flushSync(() => firstDraft.click());
		expect(firstDraft.textContent).toBe('Keyed edits: 1');

		root.render(ReturnedKeyedFragmentBoundary, { fragmentKey: 'drafts' });
		flushSync(() => {});
		expect(container.querySelector('#keyed-fragment-draft')).toBe(firstDraft);
		expect(firstDraft.textContent).toBe('Keyed edits: 1');

		root.render(ReturnedKeyedFragmentBoundary, { fragmentKey: 'sent' });
		flushSync(() => {});
		const remountedDraft = container.querySelector('#keyed-fragment-draft');
		expect(remountedDraft).not.toBe(firstDraft);
		expect(remountedDraft?.textContent).toBe('Keyed edits: 0');
		root.unmount();
		container.remove();
	});

	it('server-renders and hydrates a directly returned keyed Fragment descriptor', () => {
		const server = serverModule();
		const props = { fragmentKey: 'drafts' };
		const { html } = ServerRT.renderToString(server.DirectReturnedKeyedFragmentBoundary, props);
		expect(html).toContain('Direct keyed edits: 0');

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const firstDraft = container.querySelector('#direct-keyed-fragment-draft') as HTMLButtonElement;
		const root = hydrateRoot(container, DirectReturnedKeyedFragmentBoundary, props);
		flushSync(() => {});
		expect(container.querySelector('#direct-keyed-fragment-draft')).toBe(firstDraft);
		flushSync(() => firstDraft.click());
		expect(firstDraft.textContent).toBe('Direct keyed edits: 1');

		root.render(DirectReturnedKeyedFragmentBoundary, { fragmentKey: 'drafts' });
		flushSync(() => {});
		expect(container.querySelector('#direct-keyed-fragment-draft')).toBe(firstDraft);
		expect(firstDraft.textContent).toBe('Direct keyed edits: 1');

		root.render(DirectReturnedKeyedFragmentBoundary, { fragmentKey: 'sent' });
		flushSync(() => {});
		const remountedDraft = container.querySelector('#direct-keyed-fragment-draft');
		expect(remountedDraft).not.toBe(firstDraft);
		expect(remountedDraft?.textContent).toBe('Direct keyed edits: 0');
		root.unmount();
		container.remove();
	});

	it('server-renders and hydrates Fragment descriptor children inside a de-opt host', () => {
		const server = serverModule();
		const { html } = ServerRT.renderToString(server.DescriptorHostWithKeyedFragment, {});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;

		const before = container.querySelector('#descriptor-before');
		const first = container.querySelector('#descriptor-a');
		const second = container.querySelector('#descriptor-b');
		const after = container.querySelector('#descriptor-after');
		expect(
			Array.from(container.querySelector('#descriptor-fragment-host')!.children).map(
				(element) => element.id,
			),
		).toEqual(['descriptor-before', 'descriptor-a', 'descriptor-b', 'descriptor-after']);

		const root = hydrateRoot(container, DescriptorHostWithKeyedFragment, {});
		flushSync(() => {});
		expect(container.querySelector('#descriptor-before')).toBe(before);
		expect(container.querySelector('#descriptor-a')).toBe(first);
		expect(container.querySelector('#descriptor-b')).toBe(second);
		expect(container.querySelector('#descriptor-after')).toBe(after);

		root.render(DescriptorHostWithKeyedFragment, {});
		flushSync(() => {});
		expect(container.querySelector('#descriptor-before')).toBe(before);
		expect(container.querySelector('#descriptor-a')).toBe(first);
		expect(container.querySelector('#descriptor-b')).toBe(second);
		expect(container.querySelector('#descriptor-after')).toBe(after);
		root.unmount();
		container.remove();
	});

	it('hydrates keyed component descriptor children without duplicating server content', () => {
		const server = serverModule();
		const { html } = ServerRT.renderToString(server.DescriptorHostWithKeyedComponents, {});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const first = container.querySelector('#descriptor-component-a');
		const second = container.querySelector('#descriptor-component-b');

		const root = hydrateRoot(container, DescriptorHostWithKeyedComponents, {});
		flushSync(() => {});
		expect(container.querySelector('#descriptor-component-host')?.textContent).toBe('AB');
		expect(container.querySelector('#descriptor-component-a')).toBe(first);
		expect(container.querySelector('#descriptor-component-b')).toBe(second);

		root.render(DescriptorHostWithKeyedComponents, {});
		flushSync(() => {});
		expect(container.querySelector('#descriptor-component-host')?.textContent).toBe('AB');
		expect(container.querySelector('#descriptor-component-a')).toBe(first);
		expect(container.querySelector('#descriptor-component-b')).toBe(second);
		root.unmount();
		container.remove();
	});

	it('hoists returned-fragment title, meta, and link nodes and updates them in place', () => {
		const previousTitle = document.title;
		const r = mount(ReturnedHeadMailbox as any, {
			title: 'Draft inbox',
			description: 'Two saved drafts',
			canonical: '/drafts',
			body: 'Draft body',
		});
		const title = document.head.querySelector(
			'title[data-returned-fragment-head="title"]',
		) as HTMLTitleElement;
		const meta = document.head.querySelector(
			'meta[data-returned-fragment-head="meta"]',
		) as HTMLMetaElement;
		const link = document.head.querySelector(
			'link[data-returned-fragment-head="link"]',
		) as HTMLLinkElement;
		expect(r.container.querySelector('[data-returned-fragment-head]')).toBeNull();
		expect(title.textContent).toBe('Draft inbox');
		expect(meta.content).toBe('Two saved drafts');
		expect(link.getAttribute('href')).toBe('/drafts');

		r.update(ReturnedHeadMailbox as any, {
			title: 'Sent mailbox',
			description: 'Three sent messages',
			canonical: '/sent',
			body: 'Sent body',
		});
		expect(document.head.querySelector('title[data-returned-fragment-head="title"]')).toBe(title);
		expect(document.head.querySelector('meta[data-returned-fragment-head="meta"]')).toBe(meta);
		expect(document.head.querySelector('link[data-returned-fragment-head="link"]')).toBe(link);
		expect(title.textContent).toBe('Sent mailbox');
		expect(meta.content).toBe('Three sent messages');
		expect(link.getAttribute('href')).toBe('/sent');
		expect(r.find('#head-mailbox').textContent).toBe('Sent body');

		r.unmount();
		expect(document.head.querySelector('[data-returned-fragment-head]')).toBeNull();
		document.title = previousTitle;
	});

	it('server-renders and hydrates returned-fragment head singletons in place', () => {
		const server = serverModule();
		const props = {
			title: 'Hydrated inbox',
			description: 'Hydrated description',
			canonical: '/hydrated',
			body: 'Hydrated body',
		};
		const { html } = ServerRT.renderToString(server.ReturnedHeadMailbox, props);
		const serverMarkup = document.createElement('template');
		serverMarkup.innerHTML = html;
		const title = serverMarkup.content.querySelector('title[data-returned-fragment-head="title"]');
		const meta = serverMarkup.content.querySelector('meta[data-returned-fragment-head="meta"]');
		const link = serverMarkup.content.querySelector('link[data-returned-fragment-head="link"]');
		const body = serverMarkup.content.querySelector('#head-mailbox');
		expect(title?.textContent).toBe('Hydrated inbox');
		expect((meta as HTMLMetaElement | null)?.content).toBe('Hydrated description');
		expect(link?.getAttribute('href')).toBe('/hydrated');
		expect(body?.textContent).toBe('Hydrated body');
		for (const headElement of [title!, meta!, link!]) {
			const adjacentServerNode = headElement.previousSibling;
			if (adjacentServerNode?.nodeType === Node.COMMENT_NODE) {
				document.head.append(adjacentServerNode);
			}
			document.head.append(headElement);
		}
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.append(serverMarkup.content);
		const root = hydrateRoot(container, ReturnedHeadMailbox, props);
		flushSync(() => {});
		expect(document.head.querySelector('title[data-returned-fragment-head="title"]')).toBe(title);
		expect(document.head.querySelector('meta[data-returned-fragment-head="meta"]')).toBe(meta);
		expect(document.head.querySelector('link[data-returned-fragment-head="link"]')).toBe(link);
		expect(container.querySelector('#head-mailbox')).toBe(body);
		root.unmount();
		expect(document.head.querySelector('[data-returned-fragment-head]')).toBeNull();
		container.remove();
	});

	it('hoists direct returned title, meta, and link roots without a body node', () => {
		const titleRoot = mount(DirectReturnedTitle as any, { title: 'Direct title' });
		const metaRoot = mount(DirectReturnedMeta as any, { description: 'Direct description' });
		const linkRoot = mount(DirectReturnedLink as any, { canonical: '/direct' });
		expect(titleRoot.container.childNodes).toHaveLength(0);
		expect(metaRoot.container.childNodes).toHaveLength(0);
		expect(linkRoot.container.childNodes).toHaveLength(0);
		expect(
			document.head.querySelector('title[data-direct-returned-head="title"]')?.textContent,
		).toBe('Direct title');
		expect(
			(document.head.querySelector('meta[data-direct-returned-head="meta"]') as HTMLMetaElement)
				.content,
		).toBe('Direct description');
		expect(
			document.head.querySelector('link[data-direct-returned-head="link"]')?.getAttribute('href'),
		).toBe('/direct');

		titleRoot.update(DirectReturnedTitle as any, { title: 'Updated direct title' });
		metaRoot.update(DirectReturnedMeta as any, { description: 'Updated direct description' });
		linkRoot.update(DirectReturnedLink as any, { canonical: '/updated-direct' });
		expect(
			document.head.querySelector('title[data-direct-returned-head="title"]')?.textContent,
		).toBe('Updated direct title');
		expect(
			(document.head.querySelector('meta[data-direct-returned-head="meta"]') as HTMLMetaElement)
				.content,
		).toBe('Updated direct description');
		expect(
			document.head.querySelector('link[data-direct-returned-head="link"]')?.getAttribute('href'),
		).toBe('/updated-direct');

		titleRoot.unmount();
		metaRoot.unmount();
		linkRoot.unmount();
		expect(document.head.querySelector('[data-direct-returned-head]')).toBeNull();
	});

	it('server-renders and hydrates a direct returned head-only root', () => {
		const server = serverModule();
		const { html } = ServerRT.renderToString(server.DirectReturnedTitle, {
			title: 'Server direct title',
		});
		expect(html).toContain('Server direct title');

		const container = document.createElement('div');
		document.body.appendChild(container);
		document.head.insertAdjacentHTML('beforeend', html);
		const title = document.head.querySelector('title[data-direct-returned-head="title"]');
		const root = hydrateRoot(container, DirectReturnedTitle, { title: 'Server direct title' });
		flushSync(() => {});
		expect(container.childNodes).toHaveLength(0);
		expect(document.head.querySelector('title[data-direct-returned-head="title"]')).toBe(title);

		root.render(DirectReturnedTitle, { title: 'Hydrated direct title' });
		flushSync(() => {});
		expect(document.head.querySelector('title[data-direct-returned-head="title"]')).toBe(title);
		expect(title?.textContent).toBe('Hydrated direct title');
		root.unmount();
		expect(document.head.querySelector('[data-direct-returned-head]')).toBeNull();
		container.remove();
	});

	it('keeps a render-only child code block live in a returned fragment', () => {
		let actions = 0;
		const r = mount(ReturnedChildCodeBlock as any, {
			label: 'Archive draft',
			onAction: () => actions++,
		});
		const action = r.find('#child-code-block-action') as HTMLButtonElement;
		r.click('#child-code-block-action');
		expect(actions).toBe(1);

		r.update(ReturnedChildCodeBlock as any, {
			label: 'Restore draft',
			onAction: () => actions++,
		});
		expect(r.find('#child-code-block-action')).toBe(action);
		expect(action.textContent).toBe('Restore draft');
		r.unmount();
	});

	it('server-renders and hydrates a returned-fragment child code block in place', () => {
		const server = serverModule();
		const props = { label: 'Hydrated action', onAction: () => {} };
		const { html } = ServerRT.renderToString(server.ReturnedChildCodeBlock, props);
		expect(html).toContain('Hydrated action');

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const action = container.querySelector('#child-code-block-action') as HTMLButtonElement;
		let actions = 0;
		const root = hydrateRoot(container, ReturnedChildCodeBlock, {
			label: 'Hydrated action',
			onAction: () => actions++,
		});
		flushSync(() => {});
		expect(container.querySelector('#child-code-block-action')).toBe(action);
		flushSync(() => action.click());
		expect(actions).toBe(1);

		root.render(ReturnedChildCodeBlock, {
			label: 'Updated action',
			onAction: () => actions++,
		});
		flushSync(() => {});
		expect(container.querySelector('#child-code-block-action')).toBe(action);
		expect(action.textContent).toBe('Updated action');
		root.unmount();
		container.remove();
	});

	it('preserves returned-fragment template diagnostics', () => {
		for (const mode of ['client', 'server'] as const) {
			expect(() =>
				compile(
					`export function BadHead() { return <><head><title>bad</title></head><main>body</main></>; }`,
					`returned-head-${mode}.tsrx`,
					{ mode },
				),
			).toThrow(/<head>.*not supported/);
			expect(() =>
				compile(
					`export function BadBlock() { return <>@{ const value = 'bad'; <span>{value}</span> }</>; }`,
					`returned-child-block-${mode}.tsrx`,
					{ mode },
				),
			).toThrow(/setup statements.*not supported at JSX child position/);
		}
	});
});

// Stage 0 of the fold: a plain single-root return-JSX component (no control flow)
// folds to the return-based fragment model. Same contract as above — the inline
// `@{}` form is the oracle for the produced DOM, and updates PATCH the mounted
// nodes in place (non-VDOM: the same button/text nodes survive re-renders).
describe('folded return-JSX single root matches the inline @{} oracle', () => {
	it('byte-equal DOM on mount (markerless single-root)', () => {
		const a = mount(RetCount as any);
		const b = mount(AtBraceCount as any);
		expect(a.container.innerHTML).toBe(b.container.innerHTML);
		expect(a.container.innerHTML).toBe('<button>0</button>');
		a.unmount();
		b.unmount();
	});

	it('reconciles in place: same button node patched 0->1->2 (non-VDOM)', () => {
		const r = mount(RetCount as any);
		const btn = r.container.querySelector('button')!;
		expect(btn.textContent).toBe('0');
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('1');
		expect(r.container.querySelector('button')).toBe(btn); // SAME node — patched
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('2');
		expect(r.container.querySelector('button')).toBe(btn);
		r.unmount();
	});
});
