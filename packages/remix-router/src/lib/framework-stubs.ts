// Framework-mode + RSC surface — THROWING STUBS. react-router's framework
// mode (Meta/Links/Scripts, createRequestHandler over a @react-router/dev
// ServerBuild, fog-of-war route discovery, turbo-stream single fetch) and the
// RSC integration require the framework compiler/runtime, which is
// permanently out of scope for this port (see docs/remix-router-port-plan.md
// §1). Each export exists so the export surface reaches full parity honestly:
// importing is safe; CALLING (or rendering) throws with a pointer to the
// scope policy instead of failing somewhere deep inside.
import { createContext } from 'octane';

function frameworkStub(name: string): never {
	throw new Error(
		`${name} is part of react-router's FRAMEWORK mode (it requires the ` +
			`@react-router/dev compiler/runtime), which @octanejs/remix-router does ` +
			`not support. Library mode (data routers, declarative routers, Form/` +
			`fetchers, static SSR) is fully supported — see ` +
			`docs/remix-router-port-plan.md for the scope policy.`,
	);
}

function rscStub(name: string): never {
	throw new Error(
		`${name} is part of react-router's RSC integration, which ` +
			`@octanejs/remix-router does not support (octane has no RSC runtime). ` +
			`See docs/remix-router-port-plan.md for the scope policy.`,
	);
}

// ── Framework-mode components (throw on render) ────────────────────────────
export function Meta(): never {
	frameworkStub('<Meta>');
}
export function Links(): never {
	frameworkStub('<Links>');
}
export function Scripts(): never {
	frameworkStub('<Scripts>');
}
export function PrefetchPageLinks(): never {
	frameworkStub('<PrefetchPageLinks>');
}
export function ServerRouter(): never {
	frameworkStub('<ServerRouter>');
}

// ── Framework-mode utilities ────────────────────────────────────────────────
export function createRoutesStub(): never {
	frameworkStub('createRoutesStub');
}
export function createRequestHandler(): never {
	frameworkStub('createRequestHandler');
}
export function unstable_setDevServerHooks(): never {
	frameworkStub('unstable_setDevServerHooks');
}

// ── UNSAFE_ framework internals ─────────────────────────────────────────────
// FrameworkContext is a real context upstream (consumers null-check it — e.g.
// ScrollRestoration's SSR-script branch); a real octane context holding null
// is the honest equivalent of "not in framework mode".
export const FrameworkContext = createContext<null>(null);

export function RemixErrorBoundary(): never {
	frameworkStub('UNSAFE_RemixErrorBoundary');
}
export function getPatchRoutesOnNavigationFunction(): never {
	frameworkStub('UNSAFE_getPatchRoutesOnNavigationFunction');
}
export function useFogOFWarDiscovery(): never {
	frameworkStub('UNSAFE_useFogOFWarDiscovery');
}
export function getHydrationData(): never {
	frameworkStub('UNSAFE_getHydrationData');
}
export function createClientRoutes(): never {
	frameworkStub('UNSAFE_createClientRoutes');
}
export function createClientRoutesWithHMRRevalidationOptOut(): never {
	frameworkStub('UNSAFE_createClientRoutesWithHMRRevalidationOptOut');
}
export function shouldHydrateRouteLoader(): never {
	frameworkStub('UNSAFE_shouldHydrateRouteLoader');
}

// ── Turbo-stream single fetch (framework data protocol) ────────────────────
export const SingleFetchRedirectSymbol = Symbol('SingleFetchRedirect');
export function decodeViaTurboStream(): never {
	frameworkStub('UNSAFE_decodeViaTurboStream');
}
export function getTurboStreamSingleFetchDataStrategy(): never {
	frameworkStub('UNSAFE_getTurboStreamSingleFetchDataStrategy');
}

// ── RSC ─────────────────────────────────────────────────────────────────────
export function routeRSCServerRequest(): never {
	rscStub('unstable_routeRSCServerRequest');
}
export function RSCStaticRouter(): never {
	rscStub('unstable_RSCStaticRouter');
}
export function RSCDefaultRootErrorBoundary(): never {
	rscStub('UNSAFE_RSCDefaultRootErrorBoundary');
}
