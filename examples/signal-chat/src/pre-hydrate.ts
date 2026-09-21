import { disposeCapture, installCapture } from './measurements.ts';

export default async function preHydrate() {
	installCapture();
	window.addEventListener(
		'pagehide',
		(event) => {
			if (!event.persisted) disposeCapture();
		},
		{ once: true },
	);
	const delay = Number(new URL(location.href).searchParams.get('hydrateDelay') ?? 0);
	if (Number.isFinite(delay) && delay > 0) {
		await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5_000)));
	}
}
