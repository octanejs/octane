import { OCTANE_ROUTER_PACKAGE } from '#tanstack-start/package-names';
//#region src/core/code-splitter/framework-options.ts
var frameworkOptions = {
	react: {
		package: '@tanstack/react-router',
		idents: {
			createFileRoute: 'createFileRoute',
			lazyFn: 'lazyFn',
			lazyRouteComponent: 'lazyRouteComponent',
		},
	},
	solid: {
		package: '@tanstack/solid-router',
		idents: {
			createFileRoute: 'createFileRoute',
			lazyFn: 'lazyFn',
			lazyRouteComponent: 'lazyRouteComponent',
		},
	},
	vue: {
		package: '@tanstack/vue-router',
		idents: {
			createFileRoute: 'createFileRoute',
			lazyFn: 'lazyFn',
			lazyRouteComponent: 'lazyRouteComponent',
		},
	},
	octane: {
		package: OCTANE_ROUTER_PACKAGE,
		idents: {
			createFileRoute: 'createFileRoute',
			lazyFn: 'lazyFn',
			lazyRouteComponent: 'lazyRouteComponent',
		},
	},
};
function getFrameworkOptions(framework) {
	return frameworkOptions[framework];
}
//#endregion
export { getFrameworkOptions };
