import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
	createElement as createOctaneElement,
	createRoot as createOctaneRoot,
	flushSync as octaneFlushSync,
	startTransition as octaneStartTransition,
	Suspense as OctaneSuspense,
	use as octaneUse,
	ViewTransition as OctaneViewTransition,
} from '../../src/index.js';
import { installViewTransitionMocks } from '../conformance/_helpers/view-transition-mocks';

// React 19.3 is the first stable line with <ViewTransition>; the package oracle is older.
const oracle = createRequire(
	resolve(__dirname, '../../../../scripts/react-parity/fixtures/react-19-3/package.json'),
);
const React = await import(oracle.resolve('react'));
const ReactDOM = await import(oracle.resolve('react-dom'));
const ReactDOMClient = await import(oracle.resolve('react-dom/client'));

type Runtime = 'react' | 'octane';
type Layout = 'wrapping' | 'sibling' | 'sibling host' | 'none' | 'unrelated' | 'another root';
type Reveal = 'urgent mount' | 'transition mount' | 'urgent update' | 'transition show';

function runtimeApi(runtime: Runtime) {
	return runtime === 'react'
		? {
				h: React.createElement,
				ViewTransition: React.ViewTransition,
				Suspense: React.Suspense,
				use: React.use,
				startTransition: React.startTransition,
				flushSync: ReactDOM.flushSync,
				createRoot: ReactDOMClient.createRoot,
			}
		: {
				h: createOctaneElement as typeof React.createElement,
				ViewTransition: OctaneViewTransition as typeof React.ViewTransition,
				Suspense: OctaneSuspense as typeof React.Suspense,
				use: octaneUse as typeof React.use,
				startTransition: octaneStartTransition,
				flushSync: octaneFlushSync as typeof ReactDOM.flushSync,
				createRoot: createOctaneRoot as typeof ReactDOMClient.createRoot,
			};
}

function suspenseApp(runtime: Runtime, layout: Layout) {
	const { h, ViewTransition, Suspense, use } = runtimeApi(runtime);
	function Reader(props: { promise: Promise<string> }) {
		return h('span', { id: 'value' }, use(props.promise));
	}
	return function App(props: { promise: Promise<string> | null; show: boolean }) {
		const boundary = props.show
			? h(
					Suspense,
					{ fallback: h('span', { id: 'fallback' }, 'loading') },
					props.promise === null ? h('span', null, 'idle') : h(Reader, { promise: props.promise }),
				)
			: null;
		const section = h('section', null, boundary);
		return h(
			'main',
			null,
			layout === 'sibling' ? h(ViewTransition, null, h('nav', null, 'tabs')) : null,
			layout === 'sibling host'
				? h('aside', null, h(ViewTransition, null, h('nav', null, 'tabs')))
				: null,
			layout === 'unrelated'
				? h('aside', null, h('div', null, h(ViewTransition, null, h('nav', null, 'tabs'))))
				: null,
			layout === 'wrapping' ? h(ViewTransition, null, section) : section,
		);
	};
}

let vt: ReturnType<typeof installViewTransitionMocks>;
let containers: HTMLElement[];
beforeEach(() => {
	vt = installViewTransitionMocks();
	containers = [];
});
afterEach(() => {
	vt.restore();
	for (const container of containers) container.remove();
});

function mount(runtime: Runtime) {
	const container = document.body.appendChild(document.createElement('div'));
	containers.push(container);
	return { container, root: runtimeApi(runtime).createRoot(container) };
}

async function nativeStartsOnReveal(runtime: Runtime, layout: Layout, reveal: Reveal) {
	const api = runtimeApi(runtime);
	const App = suspenseApp(runtime, layout);
	const { container, root } = mount(runtime);
	const other = layout === 'another root' ? mount(runtime).root : null;
	if (other !== null)
		api.flushSync(() =>
			other.render(api.h(api.ViewTransition, null, api.h('nav', null, 'dialog'))),
		);
	let resolveValue!: (value: string) => void;
	const promise = new Promise<string>((resolve) => (resolveValue = resolve));
	const render = (next: Promise<string> | null, show: boolean) =>
		root.render(api.h(App, { promise: next, show }));
	if (reveal === 'urgent update' || reveal === 'transition show') {
		api.flushSync(() =>
			render(reveal === 'urgent update' ? null : promise, reveal === 'urgent update'),
		);
		await sleep(150);
	}
	if (reveal === 'urgent mount' || reveal === 'urgent update')
		api.flushSync(() => render(promise, true));
	else api.startTransition(() => render(promise, true));
	// Both renderers throttle a retry 300ms (React) / 100ms (Octane) after the fallback commit.
	await sleep(150);
	expect(container.querySelector('#fallback')).not.toBeNull();
	const before = vt.calls.length;
	resolveValue('done');
	await sleep(500);
	expect(container.querySelector('#value')?.textContent).toBe('done');
	const starts = vt.calls.length - before;
	root.unmount();
	other?.unmount();
	return starts;
}

const reveals: Reveal[] = ['urgent mount', 'transition mount', 'urgent update', 'transition show'];
const expected: Record<Layout, number> = {
	wrapping: 1,
	sibling: 1,
	'sibling host': 1,
	none: 0,
	unrelated: 0,
	'another root': 0,
};

describe.each<Runtime>(['react', 'octane'])('%s Suspense reveal View Transitions', (runtime) => {
	describe.each(Object.keys(expected) as Layout[])('with %s ViewTransition', (layout) => {
		it.each(reveals)(
			`starts ${expected[layout]} native transition(s) for an %s reveal`,
			async (reveal) => {
				expect(await nativeStartsOnReveal(runtime, layout, reveal)).toBe(expected[layout]);
			},
		);
	});

	// Neither renderer consults prefers-reduced-motion; authored CSS opts out.
	it('starts the same native transition when the user prefers reduced motion', async () => {
		const matchMedia = window.matchMedia;
		window.matchMedia = (query: string) =>
			({ matches: query.includes('reduce'), media: query }) as MediaQueryList;
		try {
			expect(await nativeStartsOnReveal(runtime, 'wrapping', 'transition show')).toBe(1);
			expect(await nativeStartsOnReveal(runtime, 'none', 'transition show')).toBe(0);
		} finally {
			window.matchMedia = matchMedia;
		}
	});
});
