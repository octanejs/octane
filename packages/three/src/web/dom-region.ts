import * as Octane from 'octane';
import type { ComponentBody, Root } from 'octane';
import { isRendererRegion, type RendererRegion } from 'octane/universal';

export type DOMRegionTarget = HTMLElement | { current: HTMLElement | null };

function isHTMLElement(value: unknown): value is HTMLElement {
	if (value === null || typeof value !== 'object') return false;
	const view = (value as Node).ownerDocument?.defaultView;
	return view !== null && view !== undefined && value instanceof view.HTMLElement;
}

function resolveTarget(target: DOMRegionTarget): HTMLElement | null {
	if (target === null || typeof target !== 'object') {
		throw new TypeError('@octanejs/three: DOMRegion target must be an HTMLElement or ref.');
	}
	const resolved = 'current' in target ? target.current : target;
	if (resolved !== null && !isHTMLElement(resolved)) {
		throw new TypeError('@octanejs/three: DOMRegion target ref must contain an HTMLElement.');
	}
	return resolved;
}

/** Package-private owner for the one DOM root materialized by a DOMRegion. */
export interface DOMRegionBinding {
	attach(): () => void;
	commit(target: DOMRegionTarget, region: RendererRegion | undefined): void;
}

export function createDOMRegionBinding(): DOMRegionBinding {
	const createRoot = Reflect.get(Octane, 'createRoot') as
		typeof import('octane').createRoot | undefined;
	if (typeof createRoot !== 'function' || typeof document === 'undefined') {
		throw new Error('@octanejs/three: DOMRegion is client-only and requires a DOM root.');
	}
	const host = document.createElement('div');
	let attached = false;
	let root: Root | null = null;

	const unmount = () => {
		const current = root;
		try {
			if (current !== null) current.unmount();
		} finally {
			host.remove();
		}
	};

	const createTrackedRoot = (): Root => {
		const next = createRoot(host);
		const rootUnmount = next.unmount.bind(next);
		let live = true;
		// The reverse-owner bridge may unmount this root before the Three sentinel
		// itself is deleted. Track that public teardown so the next accepted commit
		// can create a fresh root instead of updating an already-unmounted one.
		next.unmount = () => {
			if (!live) return;
			live = false;
			const wasCurrent = root === next;
			if (wasCurrent) root = null;
			try {
				rootUnmount();
			} finally {
				if (wasCurrent) host.remove();
			}
		};
		return next;
	};

	return {
		attach() {
			attached = true;
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				attached = false;
				unmount();
			};
		},
		commit(target, region) {
			if (!attached) return;
			const resolvedTarget = resolveTarget(target);
			if (resolvedTarget === null || region === undefined) {
				unmount();
				return;
			}
			if (
				!isRendererRegion(region) ||
				region.ownerRenderer !== 'three' ||
				region.childRenderer !== 'dom'
			) {
				throw new TypeError(
					'@octanejs/three: DOMRegion children must be a compiler-owned Three-to-DOM region.',
				);
			}

			if (root === null) root = createTrackedRoot();
			if (host.parentElement !== resolvedTarget) resolvedTarget.append(host);
			root.render(region.component as ComponentBody, region.props);
		},
	};
}
