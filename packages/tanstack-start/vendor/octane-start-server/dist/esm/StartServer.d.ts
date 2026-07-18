import { ElementDescriptor } from 'octane';
import { AnyRouter } from '@tanstack/router-core';
export interface StartServerProps {
    router: AnyRouter;
}
export declare function StartServer({ router, }: StartServerProps): ElementDescriptor<StartServerProps>;
