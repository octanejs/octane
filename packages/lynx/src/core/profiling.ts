// Build-flag-gated wire-cost counters for the dual-thread commit pipeline.
//
// The Lynx transport's dominant costs are proportional to the serialized
// command stream: the background self-check and structured clone, and the
// main-thread validate/prepare/apply/acknowledge stages. Wall-clock timing of
// those stages is host-bound, but the command count and serialized byte size
// of each commit are deterministic for a fixed app and interaction, which
// makes them gateable (see benchmarks/lynx-table). This module is the one
// permanent home for those counters so measurement never needs an ad-hoc
// patch.
//
// `__OCTANE_LYNX_PROFILE__` is substituted by the build (Rspeedy/Rspack/Vite
// `define`, see benchmarks/lynx-table). Production bundles that do not define
// it fold `LYNX_PROFILE` to false and every guarded branch disappears; the
// hot dispatch/receive paths pay nothing. Node-hosted source tests keep the
// `typeof` guard, which reads as disabled.
declare const __OCTANE_LYNX_PROFILE__: boolean | undefined;

export const LYNX_PROFILE: boolean =
	typeof __OCTANE_LYNX_PROFILE__ !== 'undefined' && __OCTANE_LYNX_PROFILE__ === true;

/**
 * Per-realm commit-pipeline counters. The background and main threads run in
 * separate realms, so each accumulates its own record under the same global
 * name: background fills the dispatch-side fields, main the receive-side ones.
 * Milliseconds are informational (host-bound); `commits`, `commands`, and
 * `bytes` are deterministic for a fixed app and interaction sequence.
 */
export interface LynxWireProfile {
	/** Commit messages dispatched (background) or applied (main). */
	commits: number;
	/** Host commands across those commits. */
	commands: number;
	/** Serialized commit size, as JSON bytes — a structured-clone-cost proxy. */
	bytes: number;
	/** Background: dev-mode outbound self-check time. */
	selfcheckMs: number;
	/** Background: transport encode time, the walk plus `JSON.stringify`. */
	encodeMs: number;
	/** Background: ContextProxy dispatch (structured clone + delivery) time. */
	dispatchMs: number;
	/** Main: transport decode time, `JSON.parse` plus any unescaping walk. */
	decodeMs: number;
	/** Main: inbound protocol validation time. */
	validateMs: number;
	/** Main: prepareLynxHostBatch staging time. */
	prepareMs: number;
	/** Main: prepared.apply() time, including the Element PAPI flush. */
	applyMs: number;
	/** Main: acknowledgement handle computation + dispatch time. */
	ackMs: number;
	/** Main: destroy-run expansion into certified teardown commands. */
	destroyRunExpandMs: number;
	/** Main: dense direct certification or expanded full-teardown validation. */
	denseValidateMs: number;
	/** Main: explicit native-event detach or structural journal release during dense apply. */
	eventDetachMs: number;
	/** Main: Element PAPI removal during dense destroy-run apply. */
	papiRemoveMs: number;
	/** Main: accepted-state and dense-store release during destroy-run apply. */
	denseReleaseMs: number;
	/** Main: commands synthesized from accepted state for destroy-run batches. */
	synthesizedCommands: number;
	/** Main: explicit Element PAPI native-event detachments completed during dense apply. */
	eventDetachCount: number;
	/** Main: Element PAPI removals completed during dense destroy-run apply. */
	papiRemoveCount: number;
	/** Main: dense host records released by destroy-run apply. */
	denseReleaseHostCount: number;
}

interface LynxProfileGlobals {
	__OCTANE_LYNX_PROF?: LynxWireProfile;
}

/** The realm's counter record, created on first use. */
export function lynxWireProfile(): LynxWireProfile {
	const globals = globalThis as LynxProfileGlobals;
	return (globals.__OCTANE_LYNX_PROF ??= {
		commits: 0,
		commands: 0,
		bytes: 0,
		selfcheckMs: 0,
		encodeMs: 0,
		dispatchMs: 0,
		decodeMs: 0,
		validateMs: 0,
		prepareMs: 0,
		applyMs: 0,
		ackMs: 0,
		destroyRunExpandMs: 0,
		denseValidateMs: 0,
		eventDetachMs: 0,
		papiRemoveMs: 0,
		denseReleaseMs: 0,
		synthesizedCommands: 0,
		eventDetachCount: 0,
		papiRemoveCount: 0,
		denseReleaseHostCount: 0,
	});
}

/**
 * Count one outbound message; commits also add commands and exact wire bytes.
 * `encoded` is the string the transport is about to dispatch, so measuring it
 * cannot disagree with what was actually sent.
 */
export function profileOutboundMessage(
	profile: LynxWireProfile,
	message: unknown,
	encoded: string,
): void {
	const record = message as { type?: unknown; batch?: { commands?: readonly unknown[] } };
	if (record.type !== 'commit') return;
	profile.commits += 1;
	profile.commands += record.batch?.commands?.length ?? 0;
	profile.bytes += encoded.length;
}
