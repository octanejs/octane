// Vendored from react-hook-form@7.81.0 src/watch.tsx (octane port).
// Watch component — subscribes to form field changes and re-renders when the
// watched fields update. Authored as .tsrx (full compile) so the useWatch call
// is slot-wrapped (see controller.tsrx note).
import { useWatch } from './useWatch.ts';

export const Watch = (props) => props.render(useWatch({ name: props.names, ...props }));
