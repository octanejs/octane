import { derived$ } from 'octane/signals';
import { draft$ } from './receipt-state.ts';

// The server shell and optional controller see the complete application state.
// The initial composer imports receipt-state.ts directly, not this aggregate.
export { draft$, selectedDay$ } from './receipt-state.ts';
export { auth$, body$, history$ } from './receipt-query-state.ts';
export const draftLength$ = derived$(() => String(draft$.get().length));
