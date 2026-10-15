import { describe, expect, it } from 'vitest';
import { act } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import { createElement, createRoot, flushSync } from '../src/index.js';

// New structure over committed DOM builds off-document and lands at commit
// (#2043): a render that adds it makes no change to the page.
const SOURCE = `
import { createElement, use } from 'octane';
function Probe(props) @{
	props.probe();
	<></>
}
export function Returns(props) {
	if (props.mode === 'none') return undefined;
	if (props.mode === 'list')
		return [
			createElement('i', { key: 'a' }, 'a'),
			createElement(Probe, { key: 'probe', probe: props.probe }),
		];
	return <b>{'host'}</b>;
}
export function StringTag(props) @{
	<main>
		<props.tag id="tagged" class={props.cls} title={props.cls}>{props.cls as string}</props.tag>
		<Probe probe={props.probe} />
	</main>
}
export function HoleList(props) @{
	<main>
		<ul id="list">{props.items}</ul>
		<Probe probe={props.probe} />
	</main>
}
function Waiter(props) @{
	const value = use(props.value);
	<b id="waited">{value as string}</b>
}
function PairWaiter(props) @{
	const value = use(props.value);
	<>
		<i id="pair-first">{value as string}</i>
		<u>{'tail'}</u>
	</>
}
export function PairArmRetry(props) @{
	<main>
		@try {
			<>
				@if (props.show) {
					<PairWaiter value={props.value} />
				}
				<Probe probe={props.probe} />
			</>
		} @pending {
			<p id="pending">{'pending'}</p>
		}
	</main>
}
export function ArmRetry(props) @{
	<main>
		@try {
			<>
				@if (props.show) {
					<Waiter value={props.value} />
				}
				<Probe probe={props.probe} />
			</>
		} @pending {
			<p id="pending">{'pending'}</p>
		}
	</main>
}
`;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

describe.each([false, true])('structure over committed DOM (dev=%s)', (dev) => {
	const client = () =>
		loadCompiledFixtureSource(SOURCE, {
			id: `structure-off-document-${dev}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});

	function mountObserved(App: any, props: any) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const observer = new MutationObserver(() => {});
		const during: MutationRecord[][] = [];
		let armed = false;
		const probe = () => {
			if (armed) during.push(observer.takeRecords());
		};
		flushSync(() => root.render(App, { ...props, probe }));
		observer.observe(container, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
		});
		return {
			container,
			during,
			arm() {
				observer.takeRecords();
				armed = true;
			},
			render(next: any) {
				root.render(App, { ...next, probe });
			},
			done() {
				observer.disconnect();
				root.unmount();
				container.remove();
			},
		};
	}

	it('builds a value hole’s new list off-document', () => {
		const c = client();
		const app = mountObserved(c.HoleList, { items: 'text' });
		try {
			app.arm();
			const items = ['a', 'b'].map((label) => createElement('li', { key: label }, label));
			flushSync(() => app.render({ items }));
			expect(app.during.length).toBeGreaterThan(0);
			for (const records of app.during) expect(records).toEqual([]);
			expect(app.container.querySelector('#list')!.textContent).toBe('ab');
		} finally {
			app.done();
		}
	});

	it('patches a committed string-tag host’s props at commit', () => {
		const c = client();
		const app = mountObserved(c.StringTag, { tag: 'section', cls: 'one' });
		try {
			const host = app.container.querySelector('#tagged')!;
			app.arm();
			flushSync(() => app.render({ tag: 'section', cls: 'two' }));
			expect(app.during.length).toBeGreaterThan(0);
			for (const records of app.during) expect(records).toEqual([]);
			expect(app.container.querySelector('#tagged')).toBe(host);
			expect(host.className).toBe('two');
			expect(host.getAttribute('title')).toBe('two');
			expect(host.textContent).toBe('two');
		} finally {
			app.done();
		}
	});

	it('builds a returned value’s new list off-document', () => {
		const c = client();
		// Its last row probes once the rows before it are in place.
		const app = mountObserved(c.Returns, { mode: 'host' });
		try {
			flushSync(() => app.render({ mode: 'none' }));
			app.arm();
			flushSync(() => app.render({ mode: 'list' }));
			expect(app.during.length).toBeGreaterThan(0);
			for (const records of app.during) expect(records).toEqual([]);
			expect(app.container.textContent).toBe('a');
		} finally {
			app.done();
		}
	});

	it.each([
		['a single root', false, '#waited'],
		['a two-root template', true, '#pair-first'],
	] as const)(
		'retries an arm that suspended before inserting anything off-document (%s)',
		async (_name, pair, id) => {
			const c = client();
			const gate = deferred<string>();
			const app = mountObserved(pair ? c.PairArmRetry : c.ArmRetry, {
				show: false,
				value: gate.promise,
			});
			try {
				await act(() => app.render({ show: true, value: gate.promise }));
				expect(app.container.querySelector('#pending')).not.toBeNull();
				app.arm();
				await act(() => gate.resolve('ready'));
				expect(app.during.length).toBeGreaterThan(0);
				for (const records of app.during) expect(records).toEqual([]);
				expect(app.container.querySelector(id)!.textContent).toBe('ready');
			} finally {
				app.done();
			}
		},
	);
});
