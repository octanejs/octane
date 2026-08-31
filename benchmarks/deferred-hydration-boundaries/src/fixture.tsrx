import { Hydrate } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

interface BoundaryGridProps {
	boundaryIds: readonly number[];
	childIds: readonly number[];
	when: HydrationStrategy;
}

export function DeferredBoundaryGrid(props: BoundaryGridProps) @{
	<main data-deferred-boundary-grid="">
		@for (const boundaryId of props.boundaryIds; key boundaryId) {
			<Hydrate when={props.when} split={false}>
				@for (const childId of props.childIds; key childId) {
					<span data-deferred-cell={boundaryId + ':' + childId}>
						{'cell:' + boundaryId + ':' + childId}
					</span>
				}
			</Hydrate>
		}
	</main>
}

export function PlainBoundaryGrid(props: Omit<BoundaryGridProps, 'when'>) @{
	<main data-plain-boundary-grid="">
		@for (const boundaryId of props.boundaryIds; key boundaryId) {
			<div data-plain-boundary={String(boundaryId)}>
				@for (const childId of props.childIds; key childId) {
					<span data-plain-cell={boundaryId + ':' + childId}>
						{'cell:' + boundaryId + ':' + childId}
					</span>
				}
			</div>
		}
	</main>
}
