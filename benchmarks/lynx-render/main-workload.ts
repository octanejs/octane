/**
 * Main-thread layer of the lynx-render workload.
 *
 * `build.mjs` compiles this entry and `src/App.lynx.tsrx` with the main-thread
 * renderer, as Rspeedy's main layer does: the fixture's hooks resolve to the
 * one-shot first-screen runtime. The bundle shares one JavaScript realm with the
 * background bundle but none of its modules, so each thread keeps its own
 * runtime state, exactly as two Lynx threads do.
 */
import { root } from '@octanejs/lynx/first-screen';
import { installLynxMainThread } from '@octanejs/lynx/main-thread';
import type { LynxContextProxy } from '@octanejs/lynx/core/protocol';
import { BenchApp, renderCounts, type BenchRow } from './src/App.lynx.tsrx';

export interface MainThreadLayer {
	readonly controller: ReturnType<typeof installLynxMainThread>;
	/** Synchronously paint the main-thread specialization of the bench app. */
	renderFirstScreen(rows: readonly BenchRow[]): void;
}

export function installMainThreadLayer(
	target: Record<string, unknown>,
	context: LynxContextProxy,
	onDiagnostic: (error: Error) => void,
): MainThreadLayer {
	const controller = installLynxMainThread({
		target,
		context,
		firstScreen: true,
		// The harness releases the readiness handshake itself, so the first
		// screen and the background's adopting render are timed separately.
		firstScreenSync: 'manual',
		firstScreenRender: 'immediate',
		onDiagnostic,
	});
	return {
		controller,
		renderFirstScreen(rows) {
			root.render(BenchApp, { rows });
		},
	};
}

/** Main-thread component executions, read only after a timing sample ends. */
export function mainRenderCount(): number {
	return renderCounts.app;
}
