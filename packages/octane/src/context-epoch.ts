// Global context-version epoch shared by every context implementation. A
// Provider commit is propagated lazily through the already-mounted Block tree
// rather than scheduling every consumer, so runtime bail fast paths and
// compiler output-cache guards treat an unmoved epoch as "no context changed".
// Every Context.$$version++ site must bump this epoch alongside — in scope:
// provideContext and universal-renderer commits. External bumpers (react-hosted
// mirrors) always follow their publish with a root.render commit, which bumps
// the epoch at renderResolved entry.
//
// The cell lives behind Symbol.for so every copy of this module — a second
// bundled octane, an ESM/CJS dual load — shares one counter. Context objects
// are deliberately cross-instance (CONTEXT_TAG is Symbol.for'd), so a foreign
// instance can bump a context a local block depends on; a per-module epoch
// would let the $$ctxDepsEpoch fast path mask that stale version. Skewed
// copies sharing the cell only see foreign bumps as "epoch moved", which is
// the conservative direction.
const EPOCH_CELL: { value: number } = ((globalThis as any)[Symbol.for('octane.contextEpoch')] ??= {
	value: 0,
});

export function contextEpochNow(): number {
	return EPOCH_CELL.value;
}

export function bumpContextEpoch(): void {
	EPOCH_CELL.value++;
}
