import {
	createContext,
	createElement,
	descriptorChildren,
	isValidElement,
	useContext,
	useInsertionEffect,
	useLayoutEffect,
	useLinkedState,
	useMemo,
	useState,
	type ElementDescriptor,
} from 'octane';
import type { Scope } from 'octane/internal/client';

const ENTRY = Symbol.for('octane-motion:presence-entry');
const OWNER = Symbol.for('octane-motion:presence-owner');
const COMMITTED = Symbol.for('octane-motion:presence-committed');
const SETTLE = Symbol.for('octane-motion:presence-settle');
const VALUE = Symbol.for('octane-motion:presence-value');

interface Entry {
	child: ElementDescriptor | null;
	present: boolean;
	generation: number;
}

export interface RetainedPresenceValue {
	present: boolean;
	generation: number;
	register(token: object): () => void;
	isCurrent(generation: number): boolean;
	complete(generation: number): void;
}

export const RetainedPresenceContext = createContext<RetainedPresenceValue | null>(null);

export interface RetainedPresenceProps {
	children?: ElementDescriptor | null;
	onExitComplete?: () => void;
}

function optionalChild(value: unknown): ElementDescriptor | null {
	if (value == null || value === false) return null;
	if (!isValidElement(value) || value.key == null)
		throw new Error('RetainedPresence accepts one optional keyed element.');
	return value;
}

function reconcile(child: ElementDescriptor | null, previous: { value: Entry } | undefined): Entry {
	const old = previous?.value;
	if (child) {
		const changed = old && (!old.present || old.child?.key !== child.key);
		return { child, present: true, generation: (old?.generation ?? 0) + (changed ? 1 : 0) };
	}
	if (!old?.child) return { child: null, present: true, generation: old?.generation ?? 0 };
	return old.present ? { ...old, present: false, generation: old.generation + 1 } : old;
}

function RetainedPresenceImpl(props: RetainedPresenceProps, scope: Scope) {
	const child = optionalChild(props.children);
	const [entry, setEntry, getEntry] = useLinkedState(child, reconcile, undefined, ENTRY);
	const [owner] = useState(
		() => ({
			hosts: new Set<object>(),
			callback: undefined as (() => void) | undefined,
			settleQueued: false,
		}),
		OWNER,
	);
	useInsertionEffect(
		() => {
			owner.callback = props.onExitComplete;
		},
		null,
		COMMITTED,
	);

	const value = useMemo<RetainedPresenceValue>(
		() => ({
			present: entry.present,
			generation: entry.generation,
			isCurrent(generation) {
				// Departing child cleanup precedes linked-state publication; block.props
				// already carries the journaled replacement and rolls back on an aborted render.
				return (
					!scope.block.disposed &&
					getEntry().generation === generation &&
					scope.block.props.children?.key === entry.child?.key
				);
			},
			register(token) {
				if (owner.hosts.size && !owner.hosts.has(token))
					throw new Error('RetainedPresence supports one exiting motion host.');
				owner.hosts.add(token);
				return () => {
					owner.hosts.delete(token);
					if (!owner.settleQueued) {
						owner.settleQueued = true;
						queueMicrotask(() => {
							owner.settleQueued = false;
							if (scope.block.disposed) return;
							const current = getEntry();
							if (!owner.hosts.size && !current.present) value.complete(current.generation);
						});
					}
				};
			},
			complete(generation) {
				const current = getEntry();
				if (
					scope.block.disposed ||
					current.present ||
					!current.child ||
					current.generation !== generation
				)
					return;
				setEntry({ ...current, child: null, present: true });
				if (!scope.block.disposed) owner.callback?.();
			},
		}),
		[entry.present, entry.generation],
		VALUE,
	);
	useLayoutEffect(
		() => {
			if (!entry.present && owner.hosts.size === 0) value.complete(entry.generation);
		},
		[entry.present, entry.generation],
		SETTLE,
	);
	return entry.child ? createElement(RetainedPresenceContext, { value }, entry.child) : null;
}

/** Retains one keyed child until its single motion host finishes exiting. */
export const RetainedPresence = descriptorChildren(RetainedPresenceImpl);

export function useIsPresent(): boolean {
	const presence = useContext(RetainedPresenceContext);
	if (!presence) throw new Error('useIsPresent requires a RetainedPresence owner.');
	return presence.present;
}
