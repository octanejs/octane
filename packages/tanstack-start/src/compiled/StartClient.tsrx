'use strong';

import { HYDRATION_RANGE_BOUNDARY, useEffect } from 'octane';
import { RouterProvider } from '@octanejs/tanstack-router/compiled';
import type { AnyRouter } from '@tanstack/router-core';

export interface StartClientProps {
	router: AnyRouter;
}

export function StartClient({ router }: StartClientProps) @{
	useEffect(() => {
		window.$_TSR?.h();
	});
	<RouterProvider router={router} />
}

StartClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';
