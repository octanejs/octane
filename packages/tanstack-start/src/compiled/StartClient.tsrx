'use strong';

import { useEffect } from 'octane';
import { HYDRATION_RANGE_BOUNDARY } from 'octane/internal/client';
import { PreconfiguredRouterProvider } from '@octanejs/tanstack-router/compiled';
import type { AnyRouter } from '@tanstack/router-core';

export interface StartClientProps {
	router: AnyRouter;
}

export function StartClient({ router }: StartClientProps) @{
	useEffect(() => {
		window.$_TSR?.h();
	});
	<PreconfiguredRouterProvider router={router} />
}

StartClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';
