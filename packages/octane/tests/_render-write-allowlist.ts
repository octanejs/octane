/**
 * Render-time DOM writes the strict check (_render-write-guard.ts) tolerates
 * until their fix lands. Each entry names a test file (relative to
 * packages/octane/tests), the runtime writer that writes, its owner and why.
 * Any other write fails. The list must be empty before the redesign ships.
 */
export interface RenderWriteAllowance {
	file: string;
	writer: string;
	owner: string;
	reason: string;
}

const FIRST_MOUNT =
	"A root's first client render over a container that holds other DOM mounts into it in place.";
const HYDRATING = 'A hydrating render writes the server DOM it adopts.';

export const RENDER_WRITE_ALLOWLIST: readonly RenderWriteAllowance[] = [
	...[
		'childSlot',
		'clearRootContainer',
		'deoptItemBody',
		'drainFrag',
		'hostElementBody',
		'mountItem',
		'renderPreparedChildList',
		'setAttribute',
	].flatMap((writer) =>
		['root-container-contract.test.ts', 'hydration/returned-host-root-hydrate.test.ts'].map(
			(file) => ({ file, writer, owner: 'structure', reason: FIRST_MOUNT }),
		),
	),
	{
		file: 'hydration/activity-hydrate.test.ts',
		writer: 'enforceHiddenDisplay',
		owner: 'hydration',
		reason: 'A hidden Activity hides the server host it hydrates during render.',
	},
	...['clearRootContainer', 'commitBag', 'setAttribute'].map((writer) => ({
		file: 'hydration/root-reentry.test.ts',
		writer,
		owner: 'hydration',
		reason: HYDRATING,
	})),
	{
		file: 'hydration/root-suspended-clone-mismatch.test.ts',
		writer: '(anonymous)',
		owner: 'hydration',
		reason: "A rolled-back hydrating attempt's cleanup removes server nodes during render.",
	},
];
