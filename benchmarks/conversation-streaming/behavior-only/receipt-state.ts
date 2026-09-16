import { signal$ } from 'octane/signals';

// The initial composer controller has no dependency on private query declarations.
export const draft$ = signal$('');
export const selectedDay$ = signal$(0);
