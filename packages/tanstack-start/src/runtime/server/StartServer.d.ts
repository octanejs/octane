import type { AnyRouter } from '@tanstack/router-core';
import type { ElementDescriptor } from 'octane';

export interface StartServerProps {
	router: AnyRouter;
}

export declare function StartServer({
	router,
}: StartServerProps): ElementDescriptor<StartServerProps>;
