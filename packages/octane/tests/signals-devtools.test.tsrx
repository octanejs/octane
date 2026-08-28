import { describe, expect, it } from 'vitest';
import { createScope, query, type Resource, type WritableSignal } from 'octane/signals';
import type { DevtoolsTreeNode, OctaneDevtoolsHook } from '../src/devtools-hook';
import { act, mount } from './_helpers';

interface ReaderProps {
	count$: WritableSignal<number>;
	resource$: Resource<string>;
}

function ProfileNativeReader(props: ReaderProps) @{
	<p>{String(props.count$.get()) + ':' + (props.resource$.latest() ?? 'waiting')}</p>
}

function ProfileNativeHost(props: ReaderProps) @{
	<section>
		<ProfileNativeReader count$={props.count$} resource$={props.resource$} />
	</section>
}

function ProfilePendingReader(props: { resource$: Resource<string> }) @{
	<p>{props.resource$.get() as string}</p>
}

function ProfilePendingHost(props: { resource$: Resource<string> }) @{
	<>
		@try {
			<ProfilePendingReader resource$={props.resource$} />
		} @pending {
			<i>loading</i>
		}
	</>
}

function hook(): OctaneDevtoolsHook {
	const value = globalThis.__OCTANE_DEVTOOLS__;
	if (value === undefined) throw new Error('Expected the profile DevTools hook.');
	return value;
}

function nodes(tree: DevtoolsTreeNode[]): DevtoolsTreeNode[] {
	return tree.flatMap((node) => [node, ...nodes(node.children)]);
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('native read DevTools profile integration', () => {
	it(
		'reports accepted child reads without evaluating lazy nodes or exposing native values',
		async () => {
			const scope = createScope({ scopeKey: 'profile-view' });
			const count$ = scope.signal$('count', 1);
			let evaluations = 0;
			scope.derived$('unused', () => {
				evaluations++;
				return 'secret-lazy-value';
			});
			const pending = deferred<string>();
			const load = query('profile-load', () => pending.promise);
			const resource$ = scope.asyncSignal$('resource', () => load(undefined));
			const rendered = mount(ProfileNativeHost, { count$, resource$ });
			try {
				const tree = nodes(hook().getTree());
				const reader = tree.find((node) => node.name === 'ProfileNativeReader')!;
				expect(reader).toBeDefined();
				const first = hook().inspect(reader.id)!;
				expect(tree.some((node) => node.id === first.nativeReads?.ownerId)).toBe(true);
				expect(first.nativeReads?.committed?.reads.map((read) => read.source)).toMatchObject([
					{ scopeKey: 'profile-view', key: 'count', read: 'value', status: 'ready' },
					{ scopeKey: 'profile-view', key: 'resource', read: 'latest', status: 'pending' },
				]);
				expect(evaluations).toBe(0);
				await act(() => {
					count$.set(2);
					pending.resolve('secret-resource-value');
				});
				const next = hook().inspect(reader.id)!;
				expect(
					next.nativeReads?.committed?.reads.every(
						(read) => read.observedVersion === read.currentVersion,
					),
				).toBe(true);
				expect(
					next.nativeReads?.committed?.reads.find(
						(read) => read.source?.key === 'resource',
					)?.source?.status,
				).toBe('ready');
				expect(evaluations).toBe(0);
				expect(JSON.stringify(next.nativeReads)).not.toContain('secret');
				expect(rendered.container.textContent).toBe('2:secret-resource-value');
				rendered.unmount();
				expect(hook().inspect(reader.id)).toBeNull();
				expect(nodes(hook().getTree()).some((node) => node.id === reader.id)).toBe(false);
				expect(
					scope.inspect().nodes.filter(
						(node) => node.key === 'count' || node.key === 'resource',
					).map((node) => node.subscribers),
				).toEqual([0, 0]);
			} finally {
				rendered.unmount();
				scope.dispose();
			}
		},
	);

	it('reports suspended retry sources and removes them after the boundary succeeds', async () => {
		const scope = createScope({ scopeKey: 'profile-pending' });
		const pending = deferred<string>();
		const load = query('profile-pending-load', () => pending.promise);
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		const rendered = mount(ProfilePendingHost, { resource$ });
		try {
			expect(rendered.container.textContent).toBe('loading');
			const waiting = nodes(hook().getTree()).flatMap(
				(node) => hook().inspect(node.id)?.nativeReads?.retry ?? [],
			);
			expect(waiting).toContainEqual(
				expect.objectContaining({
					observedVersion: null,
					source: expect.objectContaining({
						scopeKey: 'profile-pending',
						key: 'resource',
						status: 'pending',
					}),
				}),
			);
			await act(() => pending.resolve('ready'));
			expect(rendered.container.textContent).toBe('ready');
			const ready = nodes(hook().getTree()).map((node) => hook().inspect(node.id));
			expect(ready.flatMap((detail) => detail?.nativeReads?.retry ?? [])).toEqual([]);
			expect(
				ready.flatMap((detail) => detail?.nativeReads?.committed?.reads ?? []).some(
					(read) => read.source?.status === 'ready',
				),
			).toBe(true);
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});
});
