'use strong';

import { PreconfiguredRouterProvider } from '@octanejs/tanstack-router/compiled';
import type { AnyRouter } from '@tanstack/router-core';

export interface StartServerProps {
	router: AnyRouter;
}

export function StartServer({ router }: StartServerProps) @{
	<PreconfiguredRouterProvider router={router} />
}
