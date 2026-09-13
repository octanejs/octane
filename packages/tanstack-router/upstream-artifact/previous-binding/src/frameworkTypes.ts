import type { MetaDescriptor, UseNavigateResult } from '@tanstack/router-core';
import type { LinkComponentRoute } from './linkTypes';
import type {
	UseLoaderDataRoute,
	UseLoaderDepsRoute,
	UseMatchRoute,
	UseParamsRoute,
	UseRouteContextRoute,
	UseSearchRoute,
} from './routeHookTypes';

export type OctaneElementAttributes = Record<string, string | number | boolean | null | undefined>;

export type OctaneScriptAttributes = OctaneElementAttributes & {
	children?: string;
};

declare module '@tanstack/router-core' {
	interface RouteMatchExtensions {
		// router-core 1.171.15's source RouteMatch carries this field, and its SSR
		// declarations index it while the published Matches.d.ts accidentally omits
		// it. Keep the binding's public SSR entry type-checkable without asking
		// consumers to enable skipLibCheck.
		__beforeLoadContext?: Record<string, unknown>;
		meta?: Array<MetaDescriptor | undefined>;
		links?: Array<OctaneElementAttributes | undefined>;
		scripts?: Array<OctaneScriptAttributes | undefined>;
		styles?: Array<OctaneScriptAttributes | undefined>;
		headScripts?: Array<OctaneScriptAttributes | undefined>;
	}

	interface RouteExtensions<in out TId extends string, in out TFullPath extends string> {
		useMatch: UseMatchRoute<TId>;
		useRouteContext: UseRouteContextRoute<TId>;
		useSearch: UseSearchRoute<TId>;
		useParams: UseParamsRoute<TId>;
		useLoaderDeps: UseLoaderDepsRoute<TId>;
		useLoaderData: UseLoaderDataRoute<TId>;
		useNavigate: () => UseNavigateResult<TFullPath>;
		Link: LinkComponentRoute<TFullPath>;
	}
}
