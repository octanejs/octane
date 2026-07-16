interface ThreeSsrFixtureProof {
	preHydrate?: {
		canvas: Element | null;
		fallback: Element | null;
		page: Element | null;
		root: Element | null;
		shell: Element | null;
	};
}

export default function preHydrate(): void {
	const fixture = globalThis as typeof globalThis & {
		__octaneThreeSsrProof?: ThreeSsrFixtureProof;
	};
	const proof = (fixture.__octaneThreeSsrProof ??= {});
	proof.preHydrate = {
		root: document.getElementById('root'),
		page: document.querySelector('[data-three-page]'),
		shell: document.querySelector('[data-three-canvas-shell]'),
		canvas: document.querySelector('[data-three-canvas-shell] canvas'),
		fallback: document.querySelector('[data-three-native-fallback]'),
	};
}
