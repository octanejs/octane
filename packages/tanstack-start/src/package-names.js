export const OCTANE_ROUTER_PACKAGE = '@octanejs/tanstack-router';
export const OCTANE_START_PACKAGE = '@octanejs/tanstack-start';

export function getRouterPackage(framework) {
	return framework === 'octane' ? OCTANE_ROUTER_PACKAGE : `@tanstack/${framework}-router`;
}

export function getStartPackage(framework) {
	return framework === 'octane' ? OCTANE_START_PACKAGE : `@tanstack/${framework}-start`;
}
