import { describe, expect, it } from 'vitest';
import { act } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import { createRoot, flushSync } from '../src/index.js';

// A lite component (a Strong hookful callee) whose first render suspended
// keeps its Scope and mounts on the retry into DOM its boundary already
// committed, hidden (#2043). That retry builds the component off-document: its
// commit inserts it.
const SOURCE = `"use strong";
import { useState } from 'octane';
function Probe(props) @{
	props.probe();
	<></>
}
function LitePair(props) @{
	const [seen] = useState(() => props.label);
	const value = seen + ':' + props.read();
	<>
		<i id="lite-first">{value as string}</i>
		<u>{'tail'}</u>
	</>
}
function LiteSingle(props) @{
	const [seen] = useState(() => props.label);
	const value = seen + ':' + props.read();
	<b id="lite-single">{value as string}</b>
}
export function PairRetry(props) @{
	@try {
		<section>
			@try {
				<>
					<LitePair read={props.read} label={props.label} />
					<Probe probe={props.probe} />
				</>
			} @pending {
				<p id="pending">{'pending'}</p>
			}
		</section>
	} @pending {
		<p id="outer">{'outer'}</p>
	}
}
export function SingleRetry(props) @{
	@try {
		<section>
			@try {
				<>
					<LiteSingle read={props.read} label={props.label} />
					<Probe probe={props.probe} />
				</>
			} @pending {
				<p id="pending">{'pending'}</p>
			}
		</section>
	} @pending {
		<p id="outer">{'outer'}</p>
	}
}
`;

describe.each([false, true])('a lite component that resumes (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource(SOURCE, {
		id: `lite-resume-off-document-${dev}.tsrx`,
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});

	it.each([
		['a two-root template', true, '#lite-first'],
		['a single root', false, '#lite-single'],
	] as const)('mounts off-document on its retry (%s)', async (_name, pair, id) => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		let value: string | null = null;
		let resolve!: () => void;
		const ready = new Promise<void>((done) => (resolve = done));
		const read = () => {
			if (value === null) throw ready;
			return value;
		};
		const observer = new MutationObserver(() => {});
		const during: MutationRecord[][] = [];
		let armed = false;
		const probe = () => {
			if (armed) during.push(observer.takeRecords());
		};
		try {
			const App = pair ? client.PairRetry : client.SingleRetry;
			flushSync(() => root.render(App, { read, probe, label: 'first' }));
			expect(container.querySelector('#pending')).not.toBeNull();
			observer.observe(container, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
			});
			armed = true;
			value = 'ready';
			await act(() => resolve());
			expect(during.length).toBeGreaterThan(0);
			for (const records of during) expect(records).toEqual([]);
			expect(container.querySelector(id)!.textContent).toBe('first:ready');
			expect(container.querySelector('#pending')).toBeNull();
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});
});
