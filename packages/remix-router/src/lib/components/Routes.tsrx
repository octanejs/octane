// Routes — transcribed from react-router@7.18.1 lib/components.tsx, hybrid
// per docs/remix-router-port-plan.md §2a:
// - descriptor children (createRoutesFromElements results, `{expr}` arrays,
//   prop-position elements) go through createRoutesFromChildren verbatim;
// - the natural `.tsrx` block-children form (`<Routes><Route/></Routes>`
//   compiles children to an opaque render block) goes through the
//   registration collector (see routes-collector.ts): the block renders
//   invisibly under the collector context, each <Route> registers, and the
//   collected config renders through useRoutes on the next pre-paint pass.
import { isChildrenBlock, useMemo, useRef, useState } from 'octane';
import { useRoutes } from '../hooks.ts';
import {
	RoutesCollectorContext,
	createCollector,
	createRoutesFromChildren,
} from './routes-collector.ts';

export function Routes(props) @{
	@if (props.children != null && isChildrenBlock(props.children)) {
		<BlockRoutes children={props.children} location={props.location} />
	} @else {
		<ElementRoutes children={props.children} location={props.location} />
	}
}

function ElementRoutes(props) {
	return useRoutes(createRoutesFromChildren(props.children), props.location);
}

function CollectedRoutes(props) {
	return useRoutes(props.routes, props.location);
}

function BlockRoutes(props) @{
	const [version, setVersion] = useState(0);
	const collectorRef = useRef(null);
	if (collectorRef.current === null) {
		collectorRef.current = createCollector(() => setVersion((v) => v + 1));
	}
	// Registrations land in the children's layout effects (pre-paint); the
	// version bump re-renders with the finalized config, so the first paint
	// already shows the matched route.
	const routes = useMemo(() => collectorRef.current.collect(), [version]);

	<>
		<RoutesCollectorContext.Provider
			value={collectorRef.current}
		>{props.children}</RoutesCollectorContext.Provider>
		@if (version > 0) {
			<CollectedRoutes routes={routes} location={props.location} />
		}
	</>
}
