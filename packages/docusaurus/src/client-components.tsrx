import { createContext, useContext, type ComponentBody, type OctaneNode } from 'octane';
import {
	Outlet,
	RouterProvider,
	type DataRouter,
	useLocation,
	useNavigate,
	useParams,
} from '@octanejs/remix-router';

type DocusaurusPluginIdentifier = {
	name: string;
	id: string;
};

type DocusaurusRouteContextValue = {
	plugin: DocusaurusPluginIdentifier;
	data: Record<string, unknown>;
};

type DocusaurusManifestValue = {
	baseUrl: string;
};

type DocusaurusRoute = {
	children: DocusaurusRoute[];
	plugin?: DocusaurusPluginIdentifier;
	props?: Record<string, unknown>;
	[key: string]: unknown;
};

const ManifestContext = createContext<DocusaurusManifestValue | null>(null);
const RouteContext = createContext<DocusaurusRouteContextValue | null>(null);

function mergeRouteContext(
	parent: DocusaurusRouteContextValue | null,
	route: DocusaurusRoute,
	resolved: Record<string, unknown> | undefined,
): DocusaurusRouteContextValue {
	const { plugin: resolvedPlugin, data: explicitData, ...ownData } = resolved ?? {};
	const ownPlugin = resolvedPlugin as DocusaurusPluginIdentifier | undefined;
	const plugin = parent?.plugin ?? ownPlugin ?? route.plugin;
	if (plugin === undefined) {
		throw new Error(`[@octanejs/docusaurus] Route ${String(
			route.path,
		)} has no Docusaurus plugin context.`);
	}
	return {
		plugin,
		data: {
			...parent?.data,
			...ownData,
			...(explicitData !== null && typeof explicitData === 'object'
				? explicitData as Record<string, unknown>
				: {}),
		},
	};
}

export function DocusaurusRouterProvider(props: {
	manifest: DocusaurusManifestValue;
	router: DataRouter;
}) @{
	<ManifestContext.Provider value={props.manifest}>
		<RouterProvider router={props.router} />
	</ManifestContext.Provider>
}

export function DocusaurusRouteRenderer(props: {
	Component: ComponentBody<Record<string, unknown>>;
	context?: Record<string, unknown>;
	modules: Record<string, unknown>;
	route: DocusaurusRoute;
}) @{
	const parentContext = useContext(RouteContext);
	const location = useLocation();
	const navigate = useNavigate();
	const params = useParams();
	const context = mergeRouteContext(parentContext, props.route, props.context);
	const route = { ...props.route, routes: props.route.children };
	const Component = props.Component;

	<RouteContext.Provider value={context}>
		<Component
			{...props.modules}
			{...props.route.props}
			route={route}
			location={location}
			params={params}
			navigate={navigate}
		>
			<Outlet />
		</Component>
	</RouteContext.Provider>
}

export function useDocusaurusManifest(): DocusaurusManifestValue {
	const manifest = useContext(ManifestContext);
	if (manifest === null) {
		throw new Error('[@octanejs/docusaurus] useDocusaurusManifest() requires DocusaurusRouterProvider.');
	}
	return manifest;
}

export function useDocusaurusRouteContext(): DocusaurusRouteContextValue {
	const context = useContext(RouteContext);
	if (context === null) {
		throw new Error('[@octanejs/docusaurus] useDocusaurusRouteContext() requires a matched Docusaurus route.');
	}
	return context;
}
