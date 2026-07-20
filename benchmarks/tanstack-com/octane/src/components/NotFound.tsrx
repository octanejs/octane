// Minimal port of ~react/src/components/NotFound.tsx — grows toward full
// parity as the shell port proceeds.
export function NotFound() @{
	<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
		<h1 class="text-2xl font-bold">404 Not Found</h1>
		<a href="/" class="underline">Back home</a>
	</div>
}
