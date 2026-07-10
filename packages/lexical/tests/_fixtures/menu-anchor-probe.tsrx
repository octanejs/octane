import { useMenuAnchorRef } from '@octanejs/lexical/shared/useMenuAnchorRef';

// Bare probe (no composer) mirroring the upstream useMenuAnchorRef test stubs —
// the composer context is vi.mocked by the test to supply a standalone editor.
// The compiled call site injects the trailing hook slot.
export function MenuAnchorProbe(props) {
	const ref = useMenuAnchorRef(
		props.resolution ?? null,
		props.setResolution,
		props.className,
		props.parent,
		props.includeYOffset,
	);
	props.onRef(ref);
	return null;
}
