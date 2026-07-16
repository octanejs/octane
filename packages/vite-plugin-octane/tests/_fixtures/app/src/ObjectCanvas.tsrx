import { useLayoutEffect, useState } from 'octane';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalHostBoundary,
	createUniversalRoot,
} from 'octane/universal';

const ObjectBoundary = createUniversalHostBoundary('object');

interface FixtureState {
	__fixtureObjectContainer?: ReturnType<typeof createObjectContainer>;
	__fixtureObjectRegionCount?: number;
	__fixtureObjectRootCount?: number;
}

export function Canvas(props: { children?: unknown }) @{
	const [root, setRoot] = useState<ReturnType<typeof createUniversalRoot> | null>(null);

	useLayoutEffect(() => {
		const fixture = globalThis as typeof globalThis & FixtureState;
		const container = createObjectContainer();
		const nextRoot = createUniversalRoot(container, createObjectDriver());
		fixture.__fixtureObjectContainer = container;
		fixture.__fixtureObjectRegionCount = (fixture.__fixtureObjectRegionCount ?? 0) + 1;
		fixture.__fixtureObjectRootCount = (fixture.__fixtureObjectRootCount ?? 0) + 1;
		setRoot(nextRoot);
		return () => nextRoot.unmount();
	}, []);

	<section
		class="object-canvas-shell"
		data-object-canvas-shell=""
		data-object-region={root === null ? 'pending' : 'ready'}
	>
		<canvas aria-label="generic renderer canvas" />
		@if (root !== null && props.children !== undefined) {
			<ObjectBoundary root={root} children={props.children} />
		}
	</section>
}
