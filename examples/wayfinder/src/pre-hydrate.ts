export default async function preHydrate(): Promise<void> {
	const milliseconds = Number(new URL(window.location.href).searchParams.get('hydrateDelay') ?? 0);
	if (Number.isFinite(milliseconds) && milliseconds > 0) {
		await new Promise((resolve) => setTimeout(resolve, Math.min(milliseconds, 2_000)));
	}
}
