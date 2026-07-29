declare module 'virtual:octane-docusaurus-manifest' {
	const manifest: import('@octanejs/docusaurus').DocusaurusManifest;
	export default manifest;
}

declare module 'virtual:octane-docusaurus-routes' {
	export const manifest: import('@octanejs/docusaurus').DocusaurusManifest;
	export const routeModules: import('@octanejs/docusaurus/client').DocusaurusRouteModuleRegistry;
	export const routes: import('@octanejs/remix-router').RouteObject[];
}
