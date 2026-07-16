interface FixtureHydrationState {
	__fixtureSsrCanvasShell?: Element | null;
}

export const fixturePreHydrateModuleState = { ran: false };

export default function preHydrate() {
	fixturePreHydrateModuleState.ran = true;
	const fixture = globalThis as typeof globalThis & FixtureHydrationState;
	fixture.__fixtureSsrCanvasShell = document.querySelector('[data-object-canvas-shell]');
}
