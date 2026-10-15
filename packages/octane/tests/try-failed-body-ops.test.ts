import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, hydrateRoot, resetFloatResourceState } from '../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture';

// A @try body that throws is replaced by its catch arm. Whatever the failed
// render queued for commit belongs to content that never commits (#2043): its
// bag writes, its structure and its resources must not reach the page.
const SOURCE = `
import { useState } from 'octane';
function Boom(props) @{
	if (props.bang) throw new Error('boom');
	<i>{'ok'}</i>
}
export function FailingBody(props) @{
	<main>
		@try {
			<section id="body" title={props.title}>
				<link rel="stylesheet" href={props.sheet} precedence="failed-body" />
				@if (props.extra) {
					<b id="extra">{'extra'}</b>
				}
				<Boom bang={props.bang} />
			</section>
		} @catch (err) {
			<p id="caught">{'caught'}</p>
		}
	</main>
}
function Leaf(props) @{
	const [state, setState] = useState({ title: 'before', bang: false });
	props.expose(setState);
	<span id="leaf" title={state.title}>
		<Boom bang={state.bang} />
	</span>
}
export function LeafBody(props) @{
	<main>
		@try {
			<Leaf expose={props.expose} />
		} @catch (err) {
			<p id="leaf-caught">{'caught'}</p>
		}
	</main>
}
function GlobalBoom() @{
	if ((globalThis as any).__failedBodyBang) throw new Error('boom');
	<i>{'ok'}</i>
}
function UpdatingField(props) @{
	const [value, setValue] = useState(props.value);
	if (value !== 'updated' && (globalThis as any).__failedBodyBang) setValue('updated');
	<input id="updating" value={value} onInput={() => {}} />
}
export function UpdatingBody(props) @{
	<main>
		@try {
			<section>
				<UpdatingField value={props.value} />
				<GlobalBoom />
			</section>
		} @catch (err) {
			<p id="updating-caught">{'caught'}</p>
		}
	</main>
}
export function HydratingBody(props) @{
	<main>
		@try {
			<section>
				<input id="adopted" defaultValue={props.value} />
				<GlobalBoom />
			</section>
		} @catch (err) {
			<p id="hydrated-caught">{'caught'}</p>
		}
	</main>
}
export function MountingBody(props) @{
	<main>
		@if (props.show) {
			@try {
				<section id="fresh">
					<link rel="stylesheet" href="/fresh-failed.css" precedence="failed-body" />
					<Boom bang={true} />
				</section>
			} @catch (err) {
				<p id="fresh-caught">{'caught'}</p>
			}
		}
	</main>
}
`;

describe.each([false, true])('a @try body that throws in an urgent render (dev=%s)', (dev) => {
	afterEach(() => {
		document.head
			.querySelectorAll('[data-precedence="failed-body"], link[href$="failed.css"]')
			.forEach((el) => el.remove());
		resetFloatResourceState();
	});

	it('commits none of a descendant’s queued work when its own update throws', () => {
		const c = loadCompiledFixtureSource(SOURCE, {
			id: `try-failed-body-ops-${dev}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		let setState!: (next: { title: string; bang: boolean }) => void;
		try {
			flushSync(() =>
				root.render(c.LeafBody, { expose: (set: typeof setState) => (setState = set) }),
			);
			const leaf = container.querySelector('#leaf')!;
			flushSync(() => setState({ title: 'after', bang: true }));
			expect(container.querySelector('#leaf-caught')).not.toBeNull();
			expect(container.querySelector('#leaf')).toBeNull();
			expect(leaf.getAttribute('title')).toBe('before');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('commits none of a hydrating body’s adoption writes when it throws', () => {
		const client = loadCompiledFixtureSource(SOURCE, {
			id: `try-failed-body-ops-${dev}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});
		const server = loadCompiledFixtureSource(SOURCE, {
			id: `try-failed-body-ops-${dev}.tsrx`,
			mode: 'server',
			compileOptions: { dev, hmr: false },
		});
		const host = document.createElement('div');
		document.body.appendChild(host);
		(globalThis as any).__failedBodyBang = false;
		host.innerHTML = renderToString(server.HydratingBody, { value: 'server' }).html;
		const input = host.querySelector('#adopted') as HTMLInputElement;
		expect(input.getAttribute('value')).toBe('server');
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		observer.observe(host, { subtree: true, attributes: true });
		const errors: unknown[] = [];
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		(globalThis as any).__failedBodyBang = true;
		const root = hydrateRoot(
			host,
			client.HydratingBody,
			{ value: 'client' },
			{
				onRecoverableError: (error) => errors.push(error),
			},
		);
		try {
			flushSync(() => {});
			records.push(...observer.takeRecords());
			expect(host.querySelector('#hydrated-caught')).not.toBeNull();
			// The failed body's adoption write never reached the server input.
			expect(input.getAttribute('value')).toBe('server');
			expect(records.some((r) => r.target === input)).toBe(false);
		} finally {
			(globalThis as any).__failedBodyBang = false;
			observer.disconnect();
			consoleError.mockRestore();
			root.unmount();
			host.remove();
		}
	});

	it('commits none of a hydrating render-phase update’s write when the body throws', () => {
		const client = loadCompiledFixtureSource(SOURCE, {
			id: `try-failed-body-ops-${dev}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});
		const server = loadCompiledFixtureSource(SOURCE, {
			id: `try-failed-body-ops-${dev}.tsrx`,
			mode: 'server',
			compileOptions: { dev, hmr: false },
		});
		const host = document.createElement('div');
		document.body.appendChild(host);
		(globalThis as any).__failedBodyBang = false;
		host.innerHTML = renderToString(server.UpdatingBody, { value: 'server' }).html;
		const input = host.querySelector('#updating') as HTMLInputElement;
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		observer.observe(host, { subtree: true, attributes: true });
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		(globalThis as any).__failedBodyBang = true;
		const root = hydrateRoot(
			host,
			client.UpdatingBody,
			{ value: 'server' },
			{
				onRecoverableError: () => {},
			},
		);
		try {
			flushSync(() => {});
			records.push(...observer.takeRecords());
			expect(host.querySelector('#updating-caught')).not.toBeNull();
			// The update's controlled write, queued for commit, never reached the input.
			expect(input.value).toBe('server');
			expect(input.getAttribute('value')).toBe('server');
			expect(records.some((r) => r.target === input)).toBe(false);
		} finally {
			(globalThis as any).__failedBodyBang = false;
			observer.disconnect();
			consoleError.mockRestore();
			root.unmount();
			host.remove();
		}
	});

	it('inserts no resource from a body that throws as its boundary mounts', () => {
		const c = loadCompiledFixtureSource(SOURCE, {
			id: `try-failed-body-ops-${dev}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			flushSync(() => root.render(c.MountingBody, { show: false }));
			flushSync(() => root.render(c.MountingBody, { show: true }));
			expect(container.querySelector('#fresh-caught')).not.toBeNull();
			expect(container.querySelector('#fresh')).toBeNull();
			expect(
				document.head.querySelector('link[rel="stylesheet"][href="/fresh-failed.css"]'),
			).toBeNull();
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('commits none of the failed body’s queued work', () => {
		const c = loadCompiledFixtureSource(SOURCE, {
			id: `try-failed-body-ops-${dev}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		try {
			flushSync(() =>
				root.render(c.FailingBody, {
					title: 'before',
					sheet: '/kept.css',
					extra: false,
					bang: false,
				}),
			);
			const body = container.querySelector('#body')!;
			expect(body.getAttribute('title')).toBe('before');
			observer.observe(document, { subtree: true, childList: true, attributes: true });
			flushSync(() =>
				root.render(c.FailingBody, {
					title: 'after',
					sheet: '/failed.css',
					extra: true,
					bang: true,
				}),
			);
			records.push(...observer.takeRecords());
			expect(container.querySelector('#caught')).not.toBeNull();
			expect(container.querySelector('#body')).toBeNull();
			// The failed body's bag write never ran on the committed host.
			expect(body.getAttribute('title')).toBe('before');
			expect(records.some((r) => r.type === 'attributes' && r.target === body)).toBe(false);
			// Its new arm never landed.
			const added = records.flatMap((r) => [...r.addedNodes]);
			expect(added.some((n) => (n as Element).id === 'extra')).toBe(false);
			// Its stylesheet resource never joined the head. (A render-time preload
			// hint for it may, as React's does: hints insert when requested.)
			expect(document.head.querySelector('link[rel="stylesheet"][href="/failed.css"]')).toBeNull();
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});
});
