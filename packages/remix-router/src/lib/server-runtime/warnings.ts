// Vendored from react-router@7.18.1 packages/react-router/lib/server-runtime/warnings.ts — unmodified.
// Re-vendor with `node scripts/vendor-remix-router.mjs`; never hand-edit.
const alreadyWarned: { [message: string]: boolean } = {};

export function warnOnce(condition: boolean, message: string): void {
	if (!condition && !alreadyWarned[message]) {
		alreadyWarned[message] = true;
		console.warn(message);
	}
}
