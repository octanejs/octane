import { ADOPTION_CONTROL } from './signals/read-protocol.js';

/** Initial adoption inputs changed after comparison but before the authored read. */
export const INITIAL_ADOPTION_INPUT_CHANGED = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.create(null, { [ADOPTION_CONTROL]: { value: true } }),
);
