import { format } from './utils.js';
import { OCTANE_ROUTER_PACKAGE } from '#tanstack-start/package-names';
//#region src/template.ts
function fillTemplate(config, template, values, formatter) {
	const replaced = template.replace(/%%(\w+)%%/g, (_, key) => values[key] || '');
	return formatter ? formatter(replaced) : format(replaced, config);
}
function serializeRoutePath(routePath) {
	return JSON.stringify(routePath);
}
function getTargetTemplate(config) {
	const target = config.target;
	switch (target) {
		case 'react':
			return {
				fullPkg: '@tanstack/react-router',
				subPkg: 'react-router',
				rootRoute: {
					template: () =>
						[
							'import * as React from "react"\n',
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RootComponent\n }%%tsrExportEnd%%\n\n',
							'function RootComponent() { return (<React.Fragment><div>Hello "%%tsrPath%%"!</div><Outlet /></React.Fragment>) };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { Outlet, createRootRoute } from '@tanstack/react-router';",
						tsrExportStart: () => 'export const Route = createRootRoute(',
						tsrExportEnd: () => ');',
					},
				},
				route: {
					template: () =>
						[
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
							'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { createFileRoute } from '@tanstack/react-router';",
						tsrExportStart: (routePath) =>
							`export const Route = createFileRoute(${serializeRoutePath(routePath)})(`,
						tsrExportEnd: () => ');',
					},
				},
				lazyRoute: {
					template: () =>
						[
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
							'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { createLazyFileRoute } from '@tanstack/react-router';",
						tsrExportStart: (routePath) =>
							`export const Route = createLazyFileRoute(${serializeRoutePath(routePath)})(`,
						tsrExportEnd: () => ');',
					},
				},
			};
		case 'solid':
			return {
				fullPkg: '@tanstack/solid-router',
				subPkg: 'solid-router',
				rootRoute: {
					template: () =>
						[
							'import * as Solid from "solid-js"\n',
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RootComponent\n }%%tsrExportEnd%%\n\n',
							'function RootComponent() { return (<><div>Hello "%%tsrPath%%"!</div><Outlet /></>) };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { Outlet, createRootRoute } from '@tanstack/solid-router';",
						tsrExportStart: () => 'export const Route = createRootRoute(',
						tsrExportEnd: () => ');',
					},
				},
				route: {
					template: () =>
						[
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
							'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { createFileRoute } from '@tanstack/solid-router';",
						tsrExportStart: (routePath) =>
							`export const Route = createFileRoute(${serializeRoutePath(routePath)})(`,
						tsrExportEnd: () => ');',
					},
				},
				lazyRoute: {
					template: () =>
						[
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
							'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { createLazyFileRoute } from '@tanstack/solid-router';",
						tsrExportStart: (routePath) =>
							`export const Route = createLazyFileRoute(${serializeRoutePath(routePath)})(`,
						tsrExportEnd: () => ');',
					},
				},
			};
		case 'vue':
			return {
				fullPkg: '@tanstack/vue-router',
				subPkg: 'vue-router',
				rootRoute: {
					template: () =>
						[
							'import { h } from "vue"\n',
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RootComponent\n }%%tsrExportEnd%%\n\n',
							'function RootComponent() { return h("div", {}, ["Hello \\"%%tsrPath%%\\"!", h(Outlet)]) };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { Outlet, createRootRoute } from '@tanstack/vue-router';",
						tsrExportStart: () => 'export const Route = createRootRoute(',
						tsrExportEnd: () => ');',
					},
				},
				route: {
					template: () =>
						[
							'import { h } from "vue"\n',
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
							'function RouteComponent() { return h("div", {}, "Hello \\"%%tsrPath%%\\"!") };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { createFileRoute } from '@tanstack/vue-router';",
						tsrExportStart: (routePath) =>
							`export const Route = createFileRoute(${serializeRoutePath(routePath)})(`,
						tsrExportEnd: () => ');',
					},
				},
				lazyRoute: {
					template: () =>
						[
							'import { h } from "vue"\n',
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
							'function RouteComponent() { return h("div", {}, "Hello \\"%%tsrPath%%\\"!") };\n',
						].join(''),
					imports: {
						tsrImports: () => "import { createLazyFileRoute } from '@tanstack/vue-router';",
						tsrExportStart: (routePath) =>
							`export const Route = createLazyFileRoute(${serializeRoutePath(routePath)})(`,
						tsrExportEnd: () => ');',
					},
				},
			};
		case 'octane':
			return {
				fullPkg: OCTANE_ROUTER_PACKAGE,
				subPkg: 'octane-router',
				rootRoute: {
					template: () =>
						[
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RootComponent\n }%%tsrExportEnd%%\n\n',
							'function RootComponent() @{\n <div>Hello "%%tsrPath%%"!<Outlet /></div>\n}\n',
						].join(''),
					imports: {
						tsrImports: () => `import { Outlet, createRootRoute } from '${OCTANE_ROUTER_PACKAGE}';`,
						tsrExportStart: () => 'export const Route = createRootRoute(',
						tsrExportEnd: () => ');',
					},
				},
				route: {
					template: () =>
						[
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
							'function RouteComponent() @{\n <div>Hello "%%tsrPath%%"!</div>\n}\n',
						].join(''),
					imports: {
						tsrImports: () => `import { createFileRoute } from '${OCTANE_ROUTER_PACKAGE}';`,
						tsrExportStart: (routePath) =>
							`export const Route = createFileRoute(${serializeRoutePath(routePath)})(`,
						tsrExportEnd: () => ');',
					},
				},
				lazyRoute: {
					template: () =>
						[
							'%%tsrImports%%',
							'\n\n',
							'%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
							'function RouteComponent() @{\n <div>Hello "%%tsrPath%%"!</div>\n}\n',
						].join(''),
					imports: {
						tsrImports: () => `import { createLazyFileRoute } from '${OCTANE_ROUTER_PACKAGE}';`,
						tsrExportStart: (routePath) =>
							`export const Route = createLazyFileRoute(${serializeRoutePath(routePath)})(`,
						tsrExportEnd: () => ');',
					},
				},
			};
		default:
			throw new Error(`router-generator: Unknown target type: ${target}`);
	}
}
//#endregion
export { fillTemplate, getTargetTemplate };
