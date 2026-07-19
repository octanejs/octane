// Routes — transcribed from react-router@8.2.0 lib/components.tsx, hybrid
// per docs/remix-router-port-plan.md §2a:
// - descriptor children (createRoutesFromElements results, `{expr}` arrays,
//   prop-position elements) go through createRoutesFromChildren verbatim;
// - the natural `.tsrx` block-children form (`<Routes><Route/></Routes>`
//   compiles children to an opaque render block) goes through the
//   registration collector (see routes-collector.ts): the block renders
//   invisibly under the collector context, each <Route> registers, and the
//   collected config renders through useRoutes on the next pre-paint pass.
import { isChildrenBlock, useMemo, useRef, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { useRoutes } from '../hooks.ts';
import type { Location } from '../router/history.ts';
import type { RouteObject } from '../router/utils.ts';
import {
	RoutesCollectorContext,
	createCollector,
	createRoutesFromChildren,
} from './routes-collector.ts';
import type { RoutesCollector } from './routes-collector.ts';

type RoutesProps = {
	children?: OctaneNode;
	location?: Partial<Location> | string;
};

export function Routes(props: RoutesProps) @{
	@if (props.children != null && isChildrenBlock(props.children)) {
		<BlockRoutes children={props.children} location={props.location} />
	} @else {
		<ElementRoutes children={props.children} location={props.location} />
	}
}

function ElementRoutes(props: RoutesProps) {
	return useRoutes(createRoutesFromChildren(props.children), props.location);
}

function CollectedRoutes(props: { routes: RouteObject[]; location?: Partial<Location> | string }) {
	return useRoutes(props.routes, props.location);
}

function BlockRoutes(props: RoutesProps) @{
	const [version, setVersion] = useState(0);
	const collectorRef = useRef<RoutesCollector | null>(null);
	if (collectorRef.current === null) {
		collectorRef.current = createCollector(() => setVersion((v) => v + 1));
	}
	// Registrations land in the children's layout effects (pre-paint); the
	// version bump re-renders with the finalized config, so the first paint
	// already shows the matched route.
	const routes = useMemo(() => collectorRef.current!.collect(), [version]);

	<>
		<RoutesCollectorContext.Provider
			value={collectorRef.current}
		>{props.children}</RoutesCollectorContext.Provider>
		@if (version > 0) {
			<CollectedRoutes routes={routes} location={props.location} />
		}
	</>
}
