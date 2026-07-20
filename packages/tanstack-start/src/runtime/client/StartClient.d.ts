import type { AnyRouter } from '@tanstack/router-core';

export interface StartClientProps {
	router: AnyRouter;
}

export declare function StartClient({
	router,
}: StartClientProps): import('octane').ElementDescriptor<{
	router: AnyRouter;
}>;
