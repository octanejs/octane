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

const STYLE = 'Compiled split-style bindings call setStyle/setStyleProperty during render.';
const FIRST_MOUNT =
	"A root's first client render over a container that holds other DOM mounts into it in place.";

export const RENDER_WRITE_ALLOWLIST: readonly RenderWriteAllowance[] = [
	...['applyStyleValue', 'applyStyleProperty', 'setStyleProperty'].map((writer) => ({
		file: 'style-object-literals.test.ts',
		writer,
		owner: 'structure',
		reason: STYLE,
	})),
	{
		file: 'style-object-literals.test.ts',
		writer: 'rollbackTransitionJournal',
		owner: 'structure',
		reason: 'A held window restores the style a render wrote in place (JOURNAL_ATTR).',
	},
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
];
