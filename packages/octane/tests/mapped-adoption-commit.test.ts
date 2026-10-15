import { afterEach, describe, expect, it } from 'vitest';
import { createElement, createRoot, flushSync, lazy, startTransition } from '../src/index.js';
import { act } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';

// A keyed row that a custom map rendered keeps its element when a native array
// takes over the list: same key, same type, same position (React parity). The
// list keeps rendering the authored callback's descriptors, so the render that
// switches writes none of the committed row (#2043): its patches land at commit.
const SOURCE = `
function Probe(props) {
	if (props.probe) props.probe();
	return null;
}
function Rows(props) {
	const rows = props.rows;
	return (
		<section>
			<ul id="rows">
				{rows.map((item, index) => (
					<li
						key={item.id}
						ref={props.rowRef}
						data-native={props.prefix + ':' + index}
						onClick={() => props.onClick(item.id)}
					>
						<strong data-child="native">{item.label}</strong>
						{props.prefix + ':' + index}
					</li>
				))}
			</ul>
			{props.tail}
			<Probe probe={props.probe} />
		</section>
	);
}
export const App = Rows;
`;

const items = [
	{ id: 1, label: 'first' },
	{ id: 2, label: 'second' },
];

describe.each([false, true])('a custom map that a native map replaces (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource(SOURCE, {
		id: `mapped-adoption-commit-${dev}.tsx`,
		mode: 'client',
		compileOptions: { hmr: false, dev },
	});
	let done: (() => void) | null = null;
	afterEach(() => {
		done?.();
		done = null;
	});

	function setup(tag: 'li' | 'span') {
		const events: string[] = [];
		const staleRefs: (Element | null)[] = [];
		const rowRefs: (Element | null)[] = [];
		const customRows = {
			map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
				const compatible = callback(items[1]!, 3);
				return [
					createElement(
						tag,
						{ key: 1, 'data-custom': 'stale', onClick: () => events.push('custom:click') },
						createElement(
							'span',
							{ 'data-stale': 'child', ref: (el: Element | null) => staleRefs.push(el) },
							'stale',
						),
						'legacy',
					) as T,
					compatible,
				];
			},
		};
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const observer = new MutationObserver(() => {});
		const during: MutationRecord[][] = [];
		const probe = () => during.push(observer.takeRecords());
		const base = {
			onClick: (id: number) => events.push(`native:click:${id}`),
			rowRef: (el: Element | null) => rowRefs.push(el),
		};
		flushSync(() =>
			root.render(client.App, { ...base, rows: customRows, prefix: 'custom', tail: null }),
		);
		done = () => {
			observer.disconnect();
			root.unmount();
			container.remove();
		};
		const rows = () => [...container.querySelectorAll('#rows > *')];
		return {
			container,
			events,
			staleRefs,
			rowRefs,
			during,
			rows,
			customRows,
			arm() {
				observer.observe(container, {
					subtree: true,
					childList: true,
					characterData: true,
					attributes: true,
				});
				rowRefs.length = 0;
			},
			records: () => observer.takeRecords(),
			render(props: Record<string, unknown>) {
				root.render(client.App, { ...base, probe, tail: null, ...props });
			},
		};
	}

	it('repairs the preserved row off-document and lands it at commit', () => {
		const app = setup('li');
		const original = app.rows();
		const staleChild = app.container.querySelector('[data-stale="child"]');
		app.arm();
		flushSync(() => app.render({ rows: items, prefix: 'native' }));
		expect(app.during.length).toBeGreaterThan(0);
		for (const records of app.during) expect(records).toEqual([]);
		const rows = app.rows();
		expect(rows).toEqual(original);
		expect(rows.map((row) => row.textContent)).toEqual(['firstnative:0', 'secondnative:1']);
		expect(rows.map((row) => row.getAttribute('data-native'))).toEqual(['native:0', 'native:1']);
		expect(rows[0]!.getAttribute('data-custom')).toBeNull();
		expect(app.container.querySelector('[data-stale="child"]')).toBeNull();
		expect(app.staleRefs).toEqual([staleChild, null]);
		// The row's ref resolves to the preserved element, once.
		expect(app.rowRefs.filter((el) => el === original[0])).toHaveLength(1);
		expect(app.rowRefs).not.toContain(null);
		(rows[0] as HTMLElement).click();
		expect(app.events.at(-1)).toBe('native:click:1');
		(rows[0]!.querySelector('strong') as HTMLElement).click();
		expect(app.events.at(-1)).toBe('native:click:1');
	});

	it('replaces a row of another type at commit', () => {
		const app = setup('span');
		const original = app.rows();
		app.arm();
		flushSync(() => app.render({ rows: items, prefix: 'native' }));
		for (const records of app.during) expect(records).toEqual([]);
		const rows = app.rows();
		expect(rows.map((row) => row.localName)).toEqual(['li', 'li']);
		expect(rows[0]).not.toBe(original[0]);
		expect(rows[1]).toBe(original[1]);
		expect(original[0]!.isConnected).toBe(false);
		expect(rows.map((row) => row.textContent)).toEqual(['firstnative:0', 'secondnative:1']);
		(rows[0] as HTMLElement).click();
		expect(app.events.at(-1)).toBe('native:click:1');
	});

	it('leaves the preserved row untouched when the switching render is dropped', async () => {
		const app = setup('li');
		const original = app.rows();
		const html = app.container.innerHTML;
		const Never = lazy(() => new Promise<{ default: () => null }>(() => {}));
		app.arm();
		await act(() =>
			startTransition(() =>
				app.render({ rows: items, prefix: 'native', tail: createElement(Never) }),
			),
		);
		for (const records of app.during) expect(records).toEqual([]);
		expect(app.records()).toEqual([]);
		expect(app.container.innerHTML).toBe(html);
		// An urgent update keeps the custom map, and the held render is dropped.
		await act(() => app.render({ rows: app.customRows, prefix: 'custom' }));
		expect(app.rows()).toEqual(original);
		expect(app.container.innerHTML).toBe(html);
		// The preserved row still switches cleanly afterwards.
		flushSync(() => app.render({ rows: items, prefix: 'native' }));
		expect(app.rows()).toEqual(original);
		expect(app.rows().map((row) => row.textContent)).toEqual(['firstnative:0', 'secondnative:1']);
	});
});
