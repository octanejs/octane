import { derived$, signal$ } from 'octane/signals';

// Module signals shared by the shell and its renderer-free island.
export const query$ = signal$('');
export const queryLength$ = derived$(() => query$.get().length);
export const likes$ = signal$(0);
