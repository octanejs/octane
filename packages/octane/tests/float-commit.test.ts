import { afterEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot as createReactRoot } from 'react-dom/client';
import { createRoot, resetFloatResourceState, startTransition } from '../src/index.js';
import { act } from './_helpers';
import {
	FailingArmApp,
	FloatCommitApp,
	RejectedOptionName,
	type FloatCommitProps,
} from './_fixtures/float-commit.tsrx';

// React DOM's Float timing (#2043). A resource hint (preload, preinit,
// preinitModule, ...) inserts the moment it is called, even mid-render, so the
// fetch starts early and a render that never commits still leaves it. A
// stylesheet resource the document lacks preloads as the render discovers it
// (getResource). Every resource element (sheet, style, async script) reaches
// document.head only at its render's commit (acquireResource), and a dropped
// or failed render inserts none. The React cases run react-dom against the same
// scenario and compare.

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Priority = 'urgent' | 'transition';

// One head entry, with the case's id replaced so two runtimes compare.
function entry(el: Element, id: string): string {
	const url =
		el.getAttribute('href') ?? el.getAttribute('data-href') ?? el.getAttribute('src') ?? '';
	const rel = el.getAttribute('rel');
	const kind =
		el.localName === 'link'
			? rel === 'preload'
				? `preload:${el.getAttribute('as')}`
				: rel
			: el.localName === 'script'
				? el.getAttribute('type') === 'module'
					? 'module'
					: 'script'
				: el.localName;
	const group = el.getAttribute('data-precedence');
	const options = ['crossorigin', 'media']
		.filter((name) => el.hasAttribute(name))
		.map((name) => ` ${name}=${el.getAttribute(name)}`)
		.join('');
	return `${kind}${group === null ? '' : `[${group}]`} ${url.split(id).join('*')}${options}`;
}

const headEntries = (id: string) =>
	Array.from(document.head.children)
		.filter((el) =>
			(
				el.getAttribute('href') ??
				el.getAttribute('data-href') ??
				el.getAttribute('src') ??
				''
			).includes(id),
		)
		.map((el) => entry(el, id));

// Each hint, in call order, as the render issues it.
const HINTS = [
	'preload:image /*-hero.png',
	'stylesheet[init] /*-init.css',
	'module /*-module.mjs',
	'preload:style /*-app.css crossorigin=anonymous media=all',
];
// Each resource element, in render order, as the commit inserts it.
const ELEMENTS = [
	'stylesheet[app] /*-app.css crossorigin=anonymous media=all',
	'style[app] *-inline',
	'script /*-async.js',
];

/**
 * Records every head write a step makes, split at the probe inside its render:
 * an insert as its entry, any other write as its record type.
 */
function headRecorder(id: string) {
	// Every record the head produces, delivered or still queued.
	const records: MutationRecord[] = [];
	const observer = new MutationObserver((batch) => records.push(...batch));
	observer.observe(document.head, {
		childList: true,
		subtree: true,
		attributes: true,
		characterData: true,
	});
	const added = () =>
		records
			.splice(0)
			.concat(observer.takeRecords())
			.flatMap((record) =>
				record.type === 'childList' && record.removedNodes.length === 0
					? Array.from(record.addedNodes, (node) =>
							node.nodeType === 1 ? entry(node as Element, id) : `${record.type} text`,
						)
					: [`${record.type} ${(record.target as Element).localName ?? '#text'}`],
			);
	let during: string[] = [];
	return {
		probe() {
			during.push(...added());
		},
		async step(run: () => void | Promise<void>) {
			added();
			during = [];
			await run();
			return { during, after: added() };
		},
		disconnect() {
			observer.disconnect();
		},
	};
}

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	for (const el of Array.from(document.head.children)) el.remove();
	resetFloatResourceState();
});

function mountOctane(id: string, recorder: ReturnType<typeof headRecorder>) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const props: FloatCommitProps = { id, show: false, probe: () => recorder.probe() };
	root.render(FloatCommitApp, props);
	cleanups.push(() => {
		root.unmount();
		container.remove();
	});
	return {
		container,
		render: (next: Partial<FloatCommitProps>, priority: Priority) =>
			recorder.step(() =>
				act(() => {
					const update = () => root.render(FloatCommitApp, { ...props, ...next });
					if (priority === 'transition') startTransition(update);
					else update();
				}),
			),
	};
}

describe('Float resources: hints at the call, elements at commit', () => {
	it('a mount writes its hints as it renders and its elements as it commits', async () => {
		const recorder = headRecorder('mount');
		cleanups.push(() => recorder.disconnect());
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		const result = await recorder.step(() =>
			root.render(FloatCommitApp, { id: 'mount', show: true, probe: () => recorder.probe() }),
		);
		expect(result).toEqual({ during: HINTS, after: ELEMENTS });
		expect(container.querySelector('b')?.textContent).toBe('resources');
	});

	for (const priority of ['urgent', 'transition'] as const) {
		it(`a ${priority} update writes its elements only at commit`, async () => {
			const id = `update-${priority}`;
			const recorder = headRecorder(id);
			cleanups.push(() => recorder.disconnect());
			const app = mountOctane(id, recorder);
			expect(await app.render({ show: true }, priority)).toEqual({
				during: HINTS,
				after: ELEMENTS,
			});
			expect(app.container.querySelector('b')?.textContent).toBe('resources');
		});

		it(`a dropped ${priority} render leaves its hints and none of its elements`, async () => {
			const id = `dropped-${priority}`;
			const recorder = headRecorder(id);
			cleanups.push(() => recorder.disconnect());
			const app = mountOctane(id, recorder);
			// A sibling outside every boundary suspends: the root keeps its screen.
			const gate = new Promise(() => {});
			expect(await app.render({ show: true, gate }, priority)).toEqual({
				during: HINTS,
				after: [],
			});
			expect(headEntries(id)).toEqual(HINTS);
			expect(app.container.querySelector('b')).toBeNull();

			// The next render that completes needs no second hint, and commits the elements.
			expect(await app.render({ show: true }, priority)).toEqual({ during: [], after: ELEMENTS });
		});
	}

	it('an arm that fails leaves its preload and none of its sheet', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		cleanups.push(() => error.mockRestore());
		const result = await octaneFailingArms('octane-arm');
		expect(result).toEqual(FAILING_ARMS);
	});

	it('skips an attribute name the platform rejects instead of failing the commit', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(RejectedOptionName, { extra: { 'not a name': 'x', media: 'print' } });
			expect(container.textContent).toBe('committed');
			const sheet = document.head.querySelector(
				'link[rel="stylesheet"][href="/commit-rejected.css"]',
			)!;
			expect(sheet.getAttribute('media')).toBe('print');
			expect(sheet.getAttributeNames()).not.toContain('not a name');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});

// Which entries the head holds after a committed arm, its failed update, and
// a fresh arm that fails on mount. React starts the first precedence group at
// the head's start, Octane after the head's other entries, so these compare
// sets.
const FAILING_ARMS = {
	committed: ['preload:style /*-a.css', 'stylesheet[arm] /*-a.css'],
	failedUpdate: ['preload:style /*-a.css', 'preload:style /*-b.css', 'stylesheet[arm] /*-a.css'],
	failedMount: ['preload:style /*-c.css'],
};

const headSet = (id: string) => headEntries(id).sort();

async function octaneFailingArms(id: string) {
	const mountArm = () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		return {
			container,
			render: (props: { href: string; fail: boolean }) =>
				act(() => root.render(FailingArmApp, props)),
		};
	};
	const arm = mountArm();
	await arm.render({ href: `/${id}-a.css`, fail: false });
	const committed = headSet(id);
	await arm.render({ href: `/${id}-b.css`, fail: true });
	expect(arm.container.textContent).toBe('arm failure');
	const failedUpdate = headSet(id);
	const fresh = mountArm();
	await fresh.render({ href: `/${id}-fresh-c.css`, fail: true });
	expect(fresh.container.textContent).toBe('arm failure');
	return { committed, failedUpdate, failedMount: headSet(`${id}-fresh`) };
}

// ---------------------------------------------------------------------------
// The same scenarios under react-dom.
// ---------------------------------------------------------------------------

const h = React.createElement;

function ReactResources(props: { id: string }) {
	ReactDOM.preload('/' + props.id + '-hero.png', { as: 'image' });
	ReactDOM.preinit('/' + props.id + '-init.css', { as: 'style', precedence: 'init' });
	ReactDOM.preinitModule('/' + props.id + '-module.mjs');
	return h(
		React.Fragment,
		null,
		h('link', {
			rel: 'stylesheet',
			href: '/' + props.id + '-app.css',
			precedence: 'app',
			crossOrigin: 'anonymous',
			media: 'all',
		} as any),
		h(
			'style',
			{ href: props.id + '-inline', precedence: 'app' } as any,
			'.commit { color: teal; }',
		),
		h('script', { async: true, src: '/' + props.id + '-async.js' }),
		h('b', null, 'resources'),
	);
}

function ReactProbe(props: { probe: () => void }) {
	props.probe();
	return h('u', null, 'probe');
}

function ReactGate(props: { gate: PromiseLike<unknown> }) {
	React.use(props.gate as Promise<unknown>);
	return h('i', null, 'gate');
}

function ReactApp(props: FloatCommitProps) {
	return h(
		'main',
		null,
		props.show ? h(ReactResources, { id: props.id }) : null,
		h(ReactProbe, { probe: props.probe }),
		props.gate !== undefined ? h(ReactGate, { gate: props.gate }) : null,
	);
}

function Exploding(props: { fail: boolean }) {
	if (props.fail) throw new Error('arm failure');
	return h('span', null, 'arm');
}

class Boundary extends React.Component<{ children: any }, { error: Error | null }> {
	state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	render() {
		return this.state.error === null ? this.props.children : h('p', null, this.state.error.message);
	}
}

function ReactFailingArm(props: { href: string; fail: boolean }) {
	return h(
		'main',
		null,
		h(
			Boundary,
			null,
			h(
				React.Fragment,
				null,
				h('link', { rel: 'stylesheet', href: props.href, precedence: 'arm' } as any),
				h(Exploding, { fail: props.fail }),
			),
		),
	);
}

function mountReact() {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createReactRoot(container);
	cleanups.push(() => {
		React.act(() => root.unmount());
		container.remove();
	});
	return { container, root, render: (next: any) => React.act(() => root.render(next)) };
}

describe('Float timing matches react-dom', () => {
	it('a dropped transition leaves the same hints, and its retry commits the same elements', async () => {
		const runs: Record<string, unknown> = {};
		for (const runtime of ['react', 'octane'] as const) {
			const id = `parity-${runtime}`;
			const recorder = headRecorder(id);
			const gate = new Promise(() => {});
			let dropped: { during: string[]; after: string[] };
			let completed: { during: string[]; after: string[] };
			if (runtime === 'react') {
				const props: FloatCommitProps = { id, show: false, probe: () => recorder.probe() };
				const app = mountReact();
				await app.render(h(ReactApp, props));
				dropped = await recorder.step(() =>
					React.act(() =>
						React.startTransition(() =>
							app.root.render(h(ReactApp, { ...props, show: true, gate })),
						),
					),
				);
				completed = await recorder.step(() => app.render(h(ReactApp, { ...props, show: true })));
			} else {
				const app = mountOctane(id, recorder);
				dropped = await app.render({ show: true, gate }, 'transition');
				completed = await app.render({ show: true }, 'urgent');
			}
			recorder.disconnect();
			const groups = Array.from(document.head.querySelectorAll('[data-precedence]'), (el) =>
				entry(el, id),
			).filter((value) => value.includes('*'));
			runs[runtime] = { dropped, completed, groups };
		}
		expect(runs.octane).toEqual(runs.react);
		expect(runs.octane).toEqual({
			dropped: { during: HINTS, after: [] },
			completed: { during: [], after: ELEMENTS },
			groups: ['stylesheet[init] /*-init.css', ELEMENTS[0], ELEMENTS[1]],
		});
	});

	it('a failed arm leaves the same preload and no sheet', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		cleanups.push(() => error.mockRestore());
		const id = 'parity-react-arm';
		const app = mountReact();
		await app.render(h(ReactFailingArm, { href: `/${id}-a.css`, fail: false }));
		const committed = headSet(id);
		await app.render(h(ReactFailingArm, { href: `/${id}-b.css`, fail: true }));
		expect(app.container.textContent).toBe('arm failure');
		const failedUpdate = headSet(id);
		const fresh = mountReact();
		await fresh.render(h(ReactFailingArm, { href: `/${id}-fresh-c.css`, fail: true }));
		expect(fresh.container.textContent).toBe('arm failure');
		expect({ committed, failedUpdate, failedMount: headSet(`${id}-fresh`) }).toEqual(FAILING_ARMS);
	});
});
