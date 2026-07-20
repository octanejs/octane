// Minimal port of ~react/src/components/DefaultCatchBoundary.tsx — grows
// toward full parity as the shell port proceeds.
export function DefaultCatchBoundary(props: { error?: unknown }) {
	const message =
		props.error instanceof Error ? props.error.message : String(props.error);
	console.error(props.error);
	return <div class="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
		<h1 class="text-2xl font-bold">Something went wrong</h1>
		<p class="text-sm opacity-70">{message}</p>
	</div>;
}
