// Ported from @effect/atom-react 4.1.0
// (https://github.com/Effect-TS/effect/blob/9a91b1926a5fbfaffd302a7a41a94d4d53a1154e/packages/atom/react/src/RegistryContext.ts).
//
// Octane adaptations:
// - `scheduleTask` posts a host task instead of a React Scheduler task, because
//   Octane has no Scheduler package.
// - The provider renders `<RegistryContext value>`, because Octane has no
//   `Context.Provider`, and the `"use client"` directive is dropped.
/**
 * React context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through React context lets components in the same
 * subtree read and write the same atom state.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { createContext, useEffect, useRef, type OctaneNode } from 'octane';

/**
 * Schedules Atom registry work in a later host task and returns a cancellation
 * function for the scheduled task.
 *
 * @stability unstable
 * @category context
 * @since 4.0.0
 */
export function scheduleTask(f: () => void): () => void {
	// OCTANE DIVERGENCE[scheduler][ordinary:effect-atom-schedule-task-order]:
	// upstream queues a React Scheduler task at LowPriority, which Scheduler
	// delivers through a MessageChannel message (or setImmediate on Node). This
	// posts the same unclamped host task directly.
	// Each task gets its own channel: Node delivers pending messages in
	// port-creation order, so one shared port could reorder tasks.
	if (typeof MessageChannel !== 'function') {
		const timeout = setTimeout(f, 0);
		return () => clearTimeout(timeout);
	}
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		channel.port1.close();
		f();
	};
	channel.port2.postMessage(null);
	return () => channel.port1.close();
}

/**
 * Provides a React context that supplies the `AtomRegistry` used by Atom hooks and
 * hydration helpers, defaulting to a standalone registry when no provider is
 * present.
 *
 * **When to use**
 *
 * Use to supply an existing `AtomRegistry` through React context when hooks or
 * hydration helpers need to share registry state that is managed outside
 * `RegistryProvider`.
 *
 * @see {@link RegistryProvider} for creating and providing a registry for a React subtree
 *
 * @stability unstable
 * @category context
 * @since 4.0.0
 */
export const RegistryContext = createContext<AtomRegistry.AtomRegistry>(
	AtomRegistry.make({
		scheduleTask,
		defaultIdleTTL: 400,
	}),
);

/**
 * Provides a stable `AtomRegistry` to a React subtree, optionally seeding
 * initial atom values and overriding registry scheduling or idle settings.
 *
 * **When to use**
 *
 * Use to scope atom state, scheduling, and idle cleanup to a React subtree.
 *
 * **Details**
 *
 * The provider creates one `AtomRegistry` with `AtomRegistry.make`, passes it
 * through `RegistryContext`, and forwards `initialValues`, `scheduleTask`,
 * `timeoutResolution`, and `defaultIdleTTL` only when that registry is created.
 *
 * **Gotchas**
 *
 * Option changes after the first render do not rebuild the registry. When the
 * provider unmounts, registry disposal is delayed briefly and canceled if the
 * provider remounts before the timeout fires.
 *
 * @see {@link RegistryContext} for the React context supplied by this provider
 *
 * @stability unstable
 * @category context
 * @since 4.0.0
 */
export const RegistryProvider = (options: {
	readonly children?: OctaneNode | undefined;
	readonly initialValues?:
		Iterable<readonly [Atom.Atom<any>, any, Atom.InitialValueOptions?]> | undefined;
	readonly scheduleTask?: ((f: () => void) => () => void) | undefined;
	readonly timeoutResolution?: number | undefined;
	readonly defaultIdleTTL?: number | undefined;
}): OctaneNode => {
	const ref = useRef<{
		readonly registry: AtomRegistry.AtomRegistry;
		timeout?: ReturnType<typeof setTimeout> | undefined;
	} | null>(null);
	if (ref.current === null) {
		ref.current = {
			registry: AtomRegistry.make({
				scheduleTask: options.scheduleTask ?? scheduleTask,
				initialValues: options.initialValues,
				timeoutResolution: options.timeoutResolution,
				defaultIdleTTL: options.defaultIdleTTL,
			}),
		};
	}
	useEffect(() => {
		if (ref.current?.timeout !== undefined) {
			clearTimeout(ref.current.timeout);
		}
		return () => {
			ref.current!.timeout = setTimeout(() => {
				ref.current?.registry.dispose();
				ref.current = null;
			}, 500);
		};
	}, [ref]);
	return <RegistryContext value={ref.current.registry}>{options?.children}</RegistryContext>;
};
