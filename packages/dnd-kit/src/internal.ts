// The package ships raw TypeScript. Public custom hooks receive the compiler's
// trailing call-site slot and derive distinct slots for every base hook they
// compose. This keeps multiple draggable/sortable hooks in one component
// isolated while preserving upstream's stable hook identities.
import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({ global: false });
