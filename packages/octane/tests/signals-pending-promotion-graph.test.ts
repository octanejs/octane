import { expect, it } from 'vitest';
import { createScope } from 'octane/signals';
import {
	createDeclarationView,
	derivedState,
	pendingState,
	promoteDeclarationView,
	readyState,
	refreshNode,
	ScopedNode,
	signalBatch,
	type GraphOwner,
	type NodeState,
} from '../src/signals/graph.js';
import { setNativeReadObserver, type NativeReadSource } from '../src/signals/read-protocol.js';
import { deferred } from './_fixtures/signals-async-controls.js';

it('invalidates a settled pending view witness before a later subscription', async () => {
	const scope = createScope({ scopeKey: 'promotion-witness' });
	const old = deferred<void>();
	const next = deferred<void>();
	try {
		let ready = false;
		const node = new ScopedNode<string>(scope as unknown as GraphOwner, 'value', 'derived');
		node.compute = (target) =>
			derivedState(target, () => {
				throw old.promise;
			});
		refreshNode(node);
		const view = createDeclarationView(node, () => undefined);
		const compute = (target: ScopedNode<string>) =>
			derivedState(target, () => {
				if (!ready) throw next.promise;
				return 'ready';
			});
		view.compute = compute;
		let source: NativeReadSource | undefined;
		let observed = -1;
		const previous = setNativeReadObserver((current, revision) => {
			source = current;
			observed = revision;
		});
		try {
			view.snapshot();
		} finally {
			setNativeReadObserver(previous);
		}
		expect(source).toBeDefined();
		expect(source!.getVersion()).toBe(observed);
		ready = true;
		next.resolve(undefined);
		for (let n = 0; n < 4; n++) await Promise.resolve();
		node.compute = compute;
		signalBatch(() => promoteDeclarationView(view, node));
		expect(Object.is(source!.getVersion(), observed)).toBe(false);
		expect(source!.serialize?.(observed)).toBeUndefined();
		let freshSource: NativeReadSource | undefined;
		let freshVersion = -1;
		const prior = setNativeReadObserver((current, revision) => {
			freshSource = current;
			freshVersion = revision;
		});
		try {
			expect(node.snapshot()).toMatchObject({ status: 'ready', value: 'ready' });
		} finally {
			setNativeReadObserver(prior);
		}
		expect(freshSource).toBeDefined();
		expect(freshSource!.getVersion()).toBe(freshVersion);
		expect(freshSource!.getVersion()).toBe(freshVersion);
		let notifications = 0;
		const stop = freshSource!.subscribe(() => {
			notifications++;
		});
		try {
			await Promise.resolve();
			expect(notifications).toBe(0);
		} finally {
			stop();
		}
	} finally {
		old.resolve(undefined);
		next.resolve(undefined);
		scope.dispose();
	}
});

it('notifies committed readers when an equal pending view was invalidated', () => {
	const scope = createScope({ scopeKey: 'promotion-shared' });
	let stop = () => {};
	try {
		const first$ = scope.signal$('first', false);
		const next$ = scope.signal$('next', false);
		const waiting = new Promise<void>(() => {});
		const node = new ScopedNode<string>(scope as unknown as GraphOwner, 'value', 'derived');
		const firstCompute$ = () => (first$.get() ? readyState('old') : pendingState(waiting));
		node.compute = firstCompute$;
		refreshNode(node);
		const statuses: string[] = [];
		stop = node.subscribe(() => {
			statuses.push(node.snapshot().status);
		});
		const view = createDeclarationView(node, () => undefined);
		const nextCompute$ = () => (next$.get() ? readyState('new') : pendingState(waiting));
		view.compute = nextCompute$;
		refreshNode(view);
		next$.set(true);
		node.compute = nextCompute$;
		signalBatch(() => promoteDeclarationView(view, node));
		expect(statuses).toEqual(['ready']);
		expect(node.snapshot()).toMatchObject({ status: 'ready', value: 'new' });
	} finally {
		stop();
		scope.dispose();
	}
});

it('accepts a pending state without a graph wakeup', () => {
	const scope = createScope({ scopeKey: 'promotion-no-wakeup' });
	try {
		const pending: NodeState<string> = {
			snapshot: { status: 'pending', refreshing: false, connection: 'none', complete: false },
		};
		const node = new ScopedNode<string>(scope as unknown as GraphOwner, 'value', 'derived');
		node.compute = () => pending;
		refreshNode(node);
		const view = createDeclarationView(node, () => undefined);
		view.compute = () => pending;
		refreshNode(view);
		expect(() => promoteDeclarationView(view, node)).not.toThrow();
		expect(node.snapshot().status).toBe('pending');
	} finally {
		scope.dispose();
	}
});
