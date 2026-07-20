import { ErrorComponent, Link, useLocation, useRouter } from '@octanejs/tanstack-router';

export function DefaultCatchBoundary(props: { error: unknown }) @{
	const router = useRouter();
	const isRoot = useLocation({
		select: (location) => location.pathname === '/',
	});
	console.error(props.error);

	<div class="min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6">
		<ErrorComponent error={props.error} />
		<div class="flex gap-2 items-center flex-wrap">
			<button
				onClick={() => router.invalidate()}
				class="px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold"
			>
				Try Again
			</button>
			@if (isRoot) {
				<Link
					to="/"
					class="px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold"
				>
					Home
				</Link>
			} @else {
				<Link
					to="/"
					class="px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold"
					onClick={(e) => {
						e.preventDefault();
						window.history.back();
					}}
				>
					Go Back
				</Link>
			}
		</div>
	</div>
}
