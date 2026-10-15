import { useRouter } from './context';
import { createUseScripts } from './scriptContentBinding';

export const useScripts = createUseScripts(useRouter);
