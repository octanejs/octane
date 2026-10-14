import { useRouter } from './context';
import { createUseRouterState } from './routerStateBinding';

export type { UseRouterStateOptions, UseRouterStateResult } from './routerStateBinding';
export const useRouterState = createUseRouterState(useRouter);
