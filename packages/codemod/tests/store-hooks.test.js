import { copyFile, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { bundleRuntime, installDOM } from './bundle-runtime.js';

let project, client, server, dom;
beforeAll(async () => {
	dom = installDOM();
	project = await mkdtemp(path.join(os.tmpdir(), 'octane-store-hooks-'));
	await symlink(
		path.resolve(import.meta.dirname, '../node_modules'),
		path.join(project, 'node_modules'),
		'dir',
	);
	for (const file of ['octane-store-context.tsrx', 'octane-store-hooks.ts'])
		await copyFile(
			path.resolve(import.meta.dirname, '../templates', file),
			path.join(project, file),
		);
	await writeFile(
		path.join(project, 'handle.ts'),
		`
		import { bindStoreHook, useMemo, useLayoutEffect, useRef, useSyncExternalStore } from './octane-store-hooks';
		function read(api, initial, calls) {
			useLayoutEffect(function () { calls.push(arguments.length); }, [api]);
			return [useSyncExternalStore(api.subscribe, api.read, api.server), initial.current];
		}
		function useHandleImpl(api, branch, calls) {
			if (branch) {
				const initial = useRef({});
				const store = useMemo(function () { calls.push(arguments.length); return api; }, [api]);
				return read(store, initial, calls);
			}
			const initial = useRef({});
			const store = useMemo(function () { calls.push(arguments.length); return api; }, [api]);
			return read(store, initial, calls);
		}
		export const useHandle = bindStoreHook(useHandleImpl);
		export const useClientOnly = bindStoreHook(api => useSyncExternalStore(api.subscribe, api.read));`,
	);
	await writeFile(
		path.join(project, 'page.tsrx'),
		`
		'use strong';
		import {useHandle, useClientOnly} from './handle';
		export function Pair({first, second, branch, observe, calls}) @{
			const left = useHandle(first, branch, calls);
			const right = useHandle(second, false, calls);
			observe(left[1], right[1]);
			<p>{String(left[0])}|{String(right[0])}</p>
		}
		export function ClientOnly({api}) @{ const value = useClientOnly(api); <p>{String(value)}</p> }`,
	);
	const page = "export * from './page.tsrx';";
	[client, server] = await Promise.all([
		bundleRuntime(project, 'client', page + "export {createRoot, act} from 'octane';"),
		bundleRuntime(project, 'server', page + "export {renderToString} from 'octane/server';"),
	]);
});
afterAll(async () => {
	dom?.window.close();
	vi.unstubAllGlobals();
	if (project) await rm(project, { recursive: true, force: true });
});

function store(name) {
	const listeners = new Set();
	const activity = { attached: 0, detached: 0 };
	let value = name;
	return {
		read: () => value,
		server: () => name + '-server',
		subscribe(listener) {
			activity.attached++;
			listeners.add(listener);
			return () => {
				activity.detached++;
				listeners.delete(listener);
			};
		},
		set(next) {
			value = next;
			for (const notify of listeners) notify();
		},
		listeners,
		activity,
	};
}

it('preserves each hook invocation across a branch switch and releases the replaced store', async () => {
	const a = store('A'),
		b = store('B');
	const calls = [],
		refs = [];
	const observe = (...pair) => refs.push(pair);
	const props = { first: a, second: a, branch: true, observe, calls };
	expect(server.renderToString(server.Pair, props).html).toMatch(/A-server.*\|.*A-server/);
	expect(a.listeners.size).toBe(0);
	refs.length = 0;
	const host = document.createElement('div'),
		root = client.createRoot(host);
	try {
		await client.act(async () => root.render(client.Pair, props));
		expect(host.textContent).toBe('A|A');
		expect(a.listeners.size).toBe(2);
		await client.act(async () =>
			root.render(client.Pair, { ...props, observe: (...pair) => refs.push(pair) }),
		);
		expect(a.activity).toEqual({ attached: 2, detached: 0 });
		const [left, right] = refs.at(-1);
		expect(left).not.toBe(right);
		await client.act(async () => root.render(client.Pair, { ...props, first: b, branch: false }));
		expect(host.textContent).toBe('B|A');
		expect(refs.at(-1)[0]).toBe(left);
		expect(refs.at(-1)[1]).toBe(right);
		expect(a.listeners.size).toBe(1);
		expect(b.listeners.size).toBe(1);
		await client.act(async () => b.set('fresh'));
		expect(host.textContent).toBe('fresh|A');
		expect(calls.length).toBeGreaterThan(0);
		expect(calls.every((n) => n === 0)).toBe(true);
	} finally {
		await client.act(async () => root.unmount());
	}
	expect(a.listeners.size).toBe(0);
	expect(b.listeners.size).toBe(0);
});

it('permits a client-only subscription and reports a missing snapshot during server rendering', async () => {
	const api = store('live');
	expect(() => server.renderToString(server.ClientOnly, { api })).toThrow('getServerSnapshot');
	expect(api.listeners.size).toBe(0);
	const host = document.createElement('div'),
		root = client.createRoot(host);
	try {
		await client.act(async () => root.render(client.ClientOnly, { api }));
		expect(host.textContent).toBe('live');
		expect(api.listeners.size).toBe(1);
	} finally {
		await client.act(async () => root.unmount());
	}
	expect(api.listeners.size).toBe(0);
});
