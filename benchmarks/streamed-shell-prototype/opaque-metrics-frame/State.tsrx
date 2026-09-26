import { query$ } from 'octane/signals';
import { loadSession } from './calls.ts';

// Module-scope site: both builds compile this exact source and absolute path.
export const session$ = query$(() => 'current-document', loadSession);
