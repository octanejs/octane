/** @jsxImportSource octane */
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';

// The permanent-static contract includes an empty range. `children` is
// therefore optional even though useful deferred boundaries normally provide it.
export const emptyPermanentStaticBoundary = <Hydrate split={false} when={never()} />;
