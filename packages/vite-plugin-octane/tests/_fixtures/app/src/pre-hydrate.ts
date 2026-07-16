interface FixtureHydrationState {
	__fixtureSsrCanvasShell?: Element | null;
}

export default function preHydrate() {
	const fixture = globalThis as typeof globalThis & FixtureHydrationState;
	fixture.__fixtureSsrCanvasShell = document.querySelector('[data-object-canvas-shell]');
}
