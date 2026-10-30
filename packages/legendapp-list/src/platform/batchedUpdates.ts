import { unstable_batchedUpdates } from 'octane';

type Batch = (fn: () => void) => void;

export const batchedUpdates: Batch = unstable_batchedUpdates;
