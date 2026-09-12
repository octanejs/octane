import { documentSignalOwner } from '../signals/document-owner.js';
import { createSignalOwnerLifecycle } from '../signals/facade.js';
import type { SignalOwner } from '../signals/types.js';
import type { IndependentHydrateLifecycle } from './independent-island.js';
import type { StreamedSignalHydration } from './streamed-signals.js';

export interface SignalDocumentLifecycleOptions {
	readonly document: Document;
	readonly buildId: string;
	readonly documentId: string;
	readonly signalOwner?: SignalOwner;
	readonly streamedHydration?: StreamedSignalHydration;
	readonly independentHydration?: IndependentHydrateLifecycle;
	/** Host-owned identity carrier. Null, mismatch, or failure retires persisted state. */
	readonly readIdentity?: () => { readonly buildId: string; readonly documentId: string } | null;
	readonly onMismatch?: () => void;
}

/** Optional feature-local lifetime for one executing document, never an account manager. */
export function installSignalDocumentLifecycle(options: SignalDocumentLifecycleOptions) {
	const document = options.document;
	const view = document.defaultView;
	if (!view || !options.buildId || !options.documentId) {
		throw new TypeError('A signal document lifecycle requires a live document and build identity.');
	}
	const signalOwner = options.signalOwner ?? documentSignalOwner(document);
	const owner = createSignalOwnerLifecycle(signalOwner);
	let frozen = false;
	let disposed = false;
	let waiting: Promise<boolean> | undefined;
	let wake: ((active: boolean) => void) | undefined;
	const compatible = (): boolean => {
		if (owner.retired || view.document !== document) return false;
		try {
			if (options.readIdentity !== undefined) {
				const identity = options.readIdentity();
				return identity?.buildId === options.buildId && identity.documentId === options.documentId;
			}
			const data = JSON.parse(document.getElementById('__octane_data')?.textContent || 'null');
			return (
				data?.clientBuild?.version === 1 &&
				data.clientBuild.buildId === options.buildId &&
				data.streamedSignals?.buildId === options.buildId &&
				data.streamedSignals.documentId === options.documentId
			);
		} catch {
			return false;
		}
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		view.removeEventListener('pagehide', hide);
		view.removeEventListener('pageshow', show);
		owner.retire();
		options.streamedHydration?.suspend();
		options.independentHydration?.();
		wake?.(false);
		wake = undefined;
	};
	const hide = (event: PageTransitionEvent): void => {
		if (!event.persisted) {
			dispose();
			return;
		}
		if (disposed || frozen) return;
		frozen = true;
		waiting = new Promise<boolean>((resolve) => {
			wake = resolve;
		});
		owner.freeze();
		// Close the old stream permanently. A compatible restore starts unfinished
		// idempotent reads under new attempts; it never replays a mutation.
		options.streamedHydration?.suspend();
		options.independentHydration?.pause();
	};
	const show = (event: PageTransitionEvent): void => {
		if (!event.persisted || disposed || !frozen) return;
		if (!compatible()) {
			dispose();
			(options.onMismatch ?? (() => view.location.reload()))();
			return;
		}
		frozen = false;
		owner.resume();
		if (disposed || frozen) return;
		options.independentHydration?.resume();
		wake?.(true);
		wake = undefined;
		waiting = undefined;
	};
	view.addEventListener('pagehide', hide);
	view.addEventListener('pageshow', show);
	return {
		signalOwner,
		whenActive(): Promise<boolean> {
			return disposed ? Promise.resolve(false) : (waiting ?? Promise.resolve(true));
		},
		dispose,
	};
}
