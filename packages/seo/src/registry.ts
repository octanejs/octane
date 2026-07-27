/**
 * The per-tree registry every `<Title>`/`<Meta>`/`<Link>`/`<JsonLd>` writes into
 * and `<SeoOutlet>` reads back.
 *
 * The registry is created by `<SeoProvider>` and passed through context, never
 * held in module scope: concurrent SSR requests each get their own, so one
 * request can never observe another's metadata.
 *
 * Registrations are grouped by SOURCE (one per component instance) rather than
 * flattened on write, so a source that re-renders with a different key replaces
 * its previous entry instead of leaving the stale one behind, and a source that
 * unmounts takes its metadata with it. Source order is insertion order, which is
 * render order, which is why the outlet emits the same sequence on the server
 * and the client and hydration adoption stays positional.
 */
import {
	applyConfig,
	mergeDescriptors,
	type SeoConfig,
	type SeoDescriptor,
} from './descriptors.js';

export interface SeoRegistry {
	/** Record (or replace) one source's descriptors. Called during render. */
	register(sourceId: number, descriptors: readonly SeoDescriptor[]): void;
	/** Record app-level settings from one source; merged last-wins like metadata. */
	configure(sourceId: number, config: SeoConfig): void;
	remove(sourceId: number): void;
	/** Allocate a stable id for a component instance. */
	nextSourceId(): number;
	/** Merged, last-wins descriptor list. Referentially stable between changes. */
	getSnapshot(): readonly SeoDescriptor[];
	subscribe(listener: () => void): () => void;
	/** Notify subscribers if anything changed since the last flush. */
	flush(): void;
}

function sameDescriptors(a: readonly SeoDescriptor[], b: readonly SeoDescriptor[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		if (x.key !== y.key || x.tag !== y.tag || x.text !== y.text) return false;
		const xa = x.attrs;
		const ya = y.attrs;
		const xk = Object.keys(xa);
		if (xk.length !== Object.keys(ya).length) return false;
		for (const k of xk) if (xa[k] !== ya[k]) return false;
	}
	return true;
}

function sameConfig(a: SeoConfig, b: SeoConfig): boolean {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof SeoConfig>;
	for (const key of keys) if (a[key] !== b[key]) return false;
	return true;
}

export function createSeoRegistry(): SeoRegistry {
	const sources = new Map<number, readonly SeoDescriptor[]>();
	const configs = new Map<number, SeoConfig>();
	const listeners = new Set<() => void>();
	let nextId = 1;
	let snapshot: readonly SeoDescriptor[] | null = null;
	let dirty = false;

	function invalidate(): void {
		snapshot = null;
		dirty = true;
	}

	return {
		nextSourceId() {
			return nextId++;
		},
		register(sourceId, descriptors) {
			const previous = sources.get(sourceId);
			// Re-registering identical descriptors is the common case on an SSR
			// suspense re-pass and on any parent re-render; treating it as a no-op
			// keeps the snapshot reference stable so the outlet does not re-render.
			if (previous !== undefined && sameDescriptors(previous, descriptors)) return;
			sources.set(sourceId, descriptors);
			invalidate();
		},
		configure(sourceId, config) {
			const previous = configs.get(sourceId);
			// Compared field-by-field over the union of keys, so adding a SeoConfig
			// field cannot silently escape this check and stop invalidating.
			if (previous !== undefined && sameConfig(previous, config)) return;
			configs.set(sourceId, config);
			invalidate();
		},
		remove(sourceId) {
			const had = sources.delete(sourceId);
			if (configs.delete(sourceId) || had) invalidate();
		},
		getSnapshot() {
			if (snapshot === null) {
				const flat: SeoDescriptor[] = [];
				for (const descriptors of sources.values()) flat.push(...descriptors);
				const effective: SeoConfig = {};
				for (const config of configs.values()) {
					if (config.site !== undefined) effective.site = config.site;
					if (config.titleTemplate !== undefined) effective.titleTemplate = config.titleTemplate;
					// Declaring a social family anywhere opts the whole tree in.
					if (config.declaredOpenGraph === true) effective.declaredOpenGraph = true;
					if (config.declaredTwitter === true) effective.declaredTwitter = true;
				}
				snapshot = applyConfig(mergeDescriptors(flat), effective);
			}
			return snapshot;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		flush() {
			if (!dirty) return;
			dirty = false;
			for (const listener of listeners) listener();
		},
	};
}
