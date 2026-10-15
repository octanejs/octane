'use strong';

import { RouterProvider } from '@octanejs/tanstack-router/compiled';
import type { AnyRouter } from '@tanstack/router-core';

export interface StartServerProps {
	router: AnyRouter;
}

export function StartServer({ router }: StartServerProps) @{
	<RouterProvider router={router} />
}
