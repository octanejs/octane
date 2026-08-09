// Module-level op handle + shared tree constants: the vue-vapor analogue of
// the sibling fixtures' module-level `_setRoute`. App registers its setter at
// setup time (vapor bodies run once, so the closure stays valid for the app
// lifetime) and main.js wires the exported op to the window.__* hooks.

export const D = 10; // 1024 leaves, 1023 interior nodes
export const NESTED_D = 5; // 32 leaves, 31 interior nodes

let _setRoute = null;

export function bindRoute(fn) {
	_setRoute = fn;
}

export function navigate(route) {
	if (_setRoute) _setRoute(route);
}
