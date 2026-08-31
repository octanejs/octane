import { load } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { DeferredBoundaryGrid } from './fixture.tsrx';

export function renderCase(boundaryCount: number, childCount: number): string {
	return renderToString(DeferredBoundaryGrid, {
		boundaryIds: Array.from({ length: boundaryCount }, (_, index) => index),
		childIds: Array.from({ length: childCount }, (_, index) => index),
		when: load(),
	}).html;
}
