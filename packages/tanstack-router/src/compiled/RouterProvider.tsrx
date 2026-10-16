import { CompiledOutlet as CompiledComponent } from 'octane';
import { hasKeys } from '@tanstack/router-core';
import { createLazyRouteLoader } from '../lazyRouteLoader';
import type { RouterProps } from '../RouterProvider.tsrx';
import { PreconfiguredRouterProvider } from './Matches.tsrx';

export function CompiledRouterProvider(props: RouterProps) @{
	const { router, ...rest } = props;
	// Option props must apply before descendants render, including during SSR.
	if (hasKeys(rest)) {
		router.update({
			...router.options,
			...rest,
			context: { ...router.options.context, ...rest.context },
		});
	}
	<PreconfiguredRouterProvider router={router} />
}

export function lazyCompiledRouteComponent(importer: () => Promise<any>, exportName?: string) {
	const loader = createLazyRouteLoader(importer, exportName);
	function Lazy(props: any) @{
		<CompiledComponent component={loader.read()} props={props} />
	}
	Lazy.preload = loader.preload;
	return Lazy;
}
