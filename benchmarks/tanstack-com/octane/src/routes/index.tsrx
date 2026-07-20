import { createFileRoute } from '@octanejs/tanstack-router';

export const Route = createFileRoute('/')({
	component: Home,
});

// Phase 2c bootstrap placeholder — replaced by the real homepage port.
function Home() @{
	<main class="flex min-h-screen items-center justify-center">
		<h1 class="text-3xl font-black">TanStack</h1>
	</main>
}
