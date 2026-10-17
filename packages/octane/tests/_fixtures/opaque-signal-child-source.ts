import { createScope } from 'octane/signals';

// Loaded only after the renderer has mounted, and compiled with no renderer work.
export const scope = createScope({ scopeKey: 'opaque-signal-child' });
export const count$ = scope.signal$('count', 1);
