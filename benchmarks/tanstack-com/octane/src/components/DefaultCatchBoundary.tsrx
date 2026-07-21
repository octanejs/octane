import { ErrorComponent, Link, rootRouteId, useMatch, useRouter } from '@octanejs/tanstack-router';
import type { ErrorComponentProps } from '@octanejs/tanstack-router';

import { Button } from '~/ui';
import { reloadOnStaleAppError } from '~/utils/stale-app-reload';
import { useEffect } from 'octane';

// type DefaultCatchBoundaryType = {
//   status: number
//   statusText: string
//   data: string
//   isRoot?: boolean
// }

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
	const router = useRouter();

	useEffect(() => {
		reloadOnStaleAppError(error);
	}, [error]);

	const isRoot = useMatch({
		strict: false,
		select: (state) => state.id === rootRouteId,
	});

	console.error(error);

	return <div class="min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6">
		<h1 class="opacity-10 flex flex-col text-center font-black">
			{/* <div className="text-7xl leading-none">{status}</div>
        {statusText ? (
          <div className="text-3xl leading-none">{statusText}</div>
        ) : null} */}
		</h1>
		<ErrorComponent error={error} />
		<div class="flex gap-2 items-center flex-wrap">
			<Button
				color="gray"
				onClick={() => {
					router.invalidate();
				}}
			>
				Try Again
			</Button>
			{isRoot
				? <Button as={Link} to="/" color="gray">
						TanStack Home
					</Button>
				: <Button
						color="gray"
						onClick={(e: MouseEvent) => {
							e.preventDefault();
							window.history.back();
						}}
					>
						Go Back
					</Button>}
		</div>
	</div>;
}
