import { createRoot, hydrateRoot } from 'octane';
import { load } from 'octane/hydration';
import { DeferredBoundaryGrid, PlainBoundaryGrid } from './fixture.tsrx';

export interface BoundaryCaseResult {
	boundaryCount: number;
	cellCount: number;
	durationMs: number;
	serverNodesAdopted: boolean;
	sidecarsRemoved: boolean;
	unmountClean: boolean;
}

function ids(count: number): number[] {
	return Array.from({ length: count }, (_, index) => index);
}

export function hydrateCase(
	container: HTMLElement,
	boundaryCount: number,
	childCount: number,
): BoundaryCaseResult {
	const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-deferred-cell]'));
	const props = {
		boundaryIds: ids(boundaryCount),
		childIds: ids(childCount),
		when: load(),
	};

	const started = performance.now();
	const root = hydrateRoot(container, DeferredBoundaryGrid, props);
	const durationMs = performance.now() - started;

	const hydratedCells = container.querySelectorAll<HTMLElement>('[data-deferred-cell]');
	const serverNodesAdopted =
		hydratedCells.length === cells.length &&
		cells.every((cell, index) => hydratedCells[index] === cell);
	const sidecarsRemoved =
		container.querySelector(
			'script[data-octane-hydrate-seed],script[data-octane-native-signals]',
		) === null;
	const adoptedBoundaryCount = container.querySelectorAll('[data-octane-hydrate-id]').length;
	root.unmount();
	return {
		boundaryCount: adoptedBoundaryCount,
		cellCount: cells.length,
		durationMs,
		serverNodesAdopted,
		sidecarsRemoved,
		unmountClean: container.childNodes.length === 0,
	};
}

export function mountPlainCase(
	container: HTMLElement,
	boundaryCount: number,
	childCount: number,
): BoundaryCaseResult {
	const props = {
		boundaryIds: ids(boundaryCount),
		childIds: ids(childCount),
	};
	const root = createRoot(container);
	const started = performance.now();
	root.render(PlainBoundaryGrid, props);
	const durationMs = performance.now() - started;
	const cells = container.querySelectorAll('[data-plain-cell]');
	root.unmount();
	return {
		boundaryCount,
		cellCount: cells.length,
		durationMs,
		serverNodesAdopted: true,
		sidecarsRemoved: true,
		unmountClean: container.childNodes.length === 0,
	};
}
