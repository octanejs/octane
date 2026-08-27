import {
	beginNativeWriteGuard,
	endNativeWriteGuard,
	getNativeReadObserver,
	isNativeWriteGuarded,
	setNativeReadObserver,
	type NativeReadObserver,
	type NativeReadSource,
} from './read-protocol.js';

/** Compiler-owned evidence for one automatically cached computation. */
export interface NativeReadWitness {
	readonly reads: ReadonlyMap<NativeReadSource, number>;
	readonly mixed: boolean;
}

interface ScopeFrame {
	owner: object | null;
	observer: NativeReadObserver | null;
	guard: boolean;
	witnessBase: number;
	detached: boolean;
}

interface WitnessFrame {
	reads: Map<NativeReadSource, number> | null;
	mixed: boolean;
	contextToken: number;
}

/**
 * Synchronous compiler scopes and memo witnesses are shared by both renderers.
 * A scope is an existing renderer owner, never a new reactive ownership tree.
 * Reusable stack cells keep empty compiled bodies allocation-free after their
 * first nesting depth; read maps exist only for actual native reads.
 */
export function createNativeReadCollector(
	onRead: (owner: object, source: NativeReadSource, version: number) => void,
) {
	let owner: object | null = null;
	let scopeDepth = 0;
	let witnessDepth = 0;
	let witnessBase = 0;
	let detachedWitness = false;
	const scopes: ScopeFrame[] = [];
	const witnesses: WitnessFrame[] = [];

	const observe: NativeReadObserver = (source, version) => {
		if (owner !== null) onRead(owner, source, version);
		for (let i = witnessBase; i < witnessDepth; i++) {
			const frame = witnesses[i];
			const reads = (frame.reads ??= new Map());
			const previous = reads.get(source);
			if (previous === undefined) reads.set(source, version);
			else if (previous !== version) frame.mixed = true;
		}
	};

	function enter(
		next: object | null,
		guarded: boolean,
		allowWrites = false,
		keepDetached = false,
	): number {
		const token = scopeDepth++;
		const frame = (scopes[token] ??= {
			owner: null,
			observer: null,
			guard: false,
			witnessBase: 0,
			detached: false,
		});
		frame.owner = owner;
		frame.detached = detachedWitness;
		if (!keepDetached) detachedWitness = false;
		if (detachedWitness) next = null;
		frame.observer = setNativeReadObserver(next !== null || detachedWitness ? observe : null);
		frame.guard = guarded ? beginNativeWriteGuard() : isNativeWriteGuarded();
		if (allowWrites) endNativeWriteGuard(false);
		frame.witnessBase = witnessBase;
		if (!detachedWitness && next !== owner) witnessBase = witnessDepth;
		owner = next;
		return token;
	}

	function leave(token: number, guarded: boolean): void {
		if (token < 0) return;
		const frame = scopes[token];
		owner = frame.owner;
		witnessBase = frame.witnessBase;
		detachedWitness = frame.detached;
		setNativeReadObserver(frame.observer);
		if (guarded) endNativeWriteGuard(frame.guard);
		frame.owner = null;
		frame.observer = null;
		scopeDepth = token;
	}

	return {
		isDetached(): boolean {
			return detachedWitness;
		},
		beginScope(next: object): number {
			// Invocation collection already owns the compiled body in this case.
			// Graph computations can temporarily replace the observer without
			// changing the owner, so identity alone cannot skip restoration.
			if (
				next === owner &&
				!detachedWitness &&
				getNativeReadObserver() === observe &&
				isNativeWriteGuarded()
			)
				return -1;
			// A warmed computation may call a compiler-instrumented JSX helper.
			// Its nested scopes still belong to the detached witness, never to the
			// component that happened to request the warm plan.
			return enter(next, true, false, true);
		},
		endScope(token: number): void {
			leave(token, true);
		},
		/** Own parameters, the component body, and returned-output normalization. */
		beginRender(next: object | null = null): number {
			const token = enter(next, true);
			witnessBase = witnessDepth;
			return token;
		},
		endRender(token: number): void {
			leave(token, true);
		},
		/** A child Block cannot accidentally add its reads to its parent. */
		suspend(allowWrites = false): number {
			const token = enter(null, false, allowWrites);
			witnessBase = witnessDepth;
			return token;
		},
		resume(token: number, allowWrites = false): void {
			leave(token, allowWrites);
		},
		beginWitness(detached = false): number {
			if (owner === null && !detached && !detachedWitness) return -1;
			let contextToken = -1;
			if (detached) {
				contextToken = enter(null, true);
				detachedWitness = true;
				witnessBase = witnessDepth;
				setNativeReadObserver(observe);
			}
			const token = witnessDepth++;
			const frame = (witnesses[token] ??= { reads: null, mixed: false, contextToken: -1 });
			frame.reads = null;
			frame.mixed = false;
			frame.contextToken = contextToken;
			return token;
		},
		finishWitness(token: number, completed: boolean): NativeReadWitness | null {
			if (token < 0) return null;
			const frame = witnesses[token];
			const reads = frame.reads;
			frame.reads = null;
			witnessDepth = token;
			if (frame.contextToken >= 0) leave(frame.contextToken, true);
			frame.contextToken = -1;
			return completed && reads !== null ? { reads, mixed: frame.mixed } : null;
		},
		replay(witness: NativeReadWitness | null | undefined): void {
			if (witness === null || witness === undefined) return;
			for (const [source, version] of witness.reads) observe(source, version);
		},
	};
}

export function validateNativeReadWitness(witness: NativeReadWitness | null | undefined): boolean {
	if (witness === null || witness === undefined) return true;
	if (witness.mixed) return false;
	for (const [source, version] of witness.reads) {
		if (source.getVersion() !== version) return false;
	}
	return true;
}
