import { useRouter } from './context';
import { createUseTags } from './headContentBinding';

export const useTags = createUseTags(useRouter);
