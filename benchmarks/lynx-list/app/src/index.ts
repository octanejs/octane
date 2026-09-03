import { root } from '@octanejs/lynx';

import { App } from './App.lynx.tsrx';
import { FIXTURE_ID, FIXTURE_ROLE, LOGICAL_ROW_COUNT } from './data.js';
import type { ListCaseId, ListSemanticCheckpoint } from './data.js';
import './app.css';

interface NativeStartupReceipt {
	readonly protocol: 'lynx-native-startup-v1';
	readonly moduleStartMs: number;
	readonly commitAckMs: number;
	readonly firstFrameMs: number;
	readonly secondFrameMs: number;
	readonly renderEvidence: {
		readonly kind: 'native-animation-frame';
		readonly frames: 2;
	};
	readonly transportEvidence: {
		readonly kind: 'octane-root.render';
		readonly acknowledged: true;
		readonly ackMs: number;
	};
	readonly postState: ListSemanticCheckpoint;
}

interface NativeUnsupportedReceipt {
	readonly status: 'not-measured';
	readonly cause: 'native-list-unavailable';
	readonly fixtureRole: typeof FIXTURE_ROLE;
	readonly fixtureId: typeof FIXTURE_ID;
	readonly logicalRowCount: number;
	readonly message: string;
}

interface NativeTeardownReceipt {
	readonly protocol: 'lynx-native-list-teardown-v1';
	readonly fixtureRole: typeof FIXTURE_ROLE;
	readonly fixtureId: typeof FIXTURE_ID;
	readonly complete: true;
	readonly completedMs: number;
}

type BenchmarkGlobal = typeof globalThis & {
	readonly lynx: {
		requestAnimationFrame(callback: () => void): void;
	};
	__LYNX_BENCH_ERROR__?: string;
	__LYNX_BENCH_STARTUP__?: NativeStartupReceipt;
	__LYNX_BENCH_UNSUPPORTED__?: NativeUnsupportedReceipt;
	__LYNX_BOUNDED_LIST_CHECKPOINT__?: (caseId: ListCaseId) => ListSemanticCheckpoint | undefined;
	__LYNX_BOUNDED_LIST_TEARDOWN__?: () => Promise<NativeTeardownReceipt>;
	__LYNX_BOUNDED_LIST_TEARDOWN_RECEIPT__?: NativeTeardownReceipt;
};

const benchmarkGlobal = globalThis as BenchmarkGlobal;
const moduleStartMs = Date.now();

function errorText(error: unknown): string {
	return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function reportRenderFailure(error: unknown): void {
	const message = errorText(error);
	if (
		message.includes('<list> requires __CreateList') ||
		message.includes('requires __CreateList and __UpdateListCallbacks')
	) {
		const receipt: NativeUnsupportedReceipt = {
			status: 'not-measured',
			cause: 'native-list-unavailable',
			fixtureRole: FIXTURE_ROLE,
			fixtureId: FIXTURE_ID,
			logicalRowCount: LOGICAL_ROW_COUNT,
			message,
		};
		benchmarkGlobal.__LYNX_BENCH_UNSUPPORTED__ = receipt;
		console.log('__NATIVE_BENCH_UNSUPPORTED__', JSON.stringify(receipt));
		return;
	}
	benchmarkGlobal.__LYNX_BENCH_ERROR__ = message;
}

const rendering = root.render(App);

benchmarkGlobal.__LYNX_BOUNDED_LIST_TEARDOWN__ = async () => {
	await root.unmount();
	const receipt: NativeTeardownReceipt = {
		protocol: 'lynx-native-list-teardown-v1',
		fixtureRole: FIXTURE_ROLE,
		fixtureId: FIXTURE_ID,
		complete: true,
		completedMs: Date.now(),
	};
	benchmarkGlobal.__LYNX_BOUNDED_LIST_TEARDOWN_RECEIPT__ = receipt;
	return receipt;
};

// The generated main-thread entry returns synchronously. Only the background
// root returns the transport acknowledgement promise used by the producer
// receipt, so the engine receives one receipt from the successful live root.
if (rendering !== null && typeof rendering === 'object' && 'then' in rendering) {
	void rendering.then(() => {
		const commitAckMs = Date.now();
		benchmarkGlobal.lynx.requestAnimationFrame(() => {
			const firstFrameMs = Date.now();
			benchmarkGlobal.lynx.requestAnimationFrame(() => {
				const secondFrameMs = Date.now();
				const postState = benchmarkGlobal.__LYNX_BOUNDED_LIST_CHECKPOINT__?.('list-startup');
				if (postState === undefined) {
					benchmarkGlobal.__LYNX_BENCH_ERROR__ =
						'Octane bounded Native list started without an observed semantic checkpoint.';
					return;
				}
				const receipt: NativeStartupReceipt = {
					protocol: 'lynx-native-startup-v1',
					moduleStartMs,
					commitAckMs,
					firstFrameMs,
					secondFrameMs,
					renderEvidence: { kind: 'native-animation-frame', frames: 2 },
					transportEvidence: {
						kind: 'octane-root.render',
						acknowledged: true,
						ackMs: commitAckMs,
					},
					postState,
				};
				benchmarkGlobal.__LYNX_BENCH_STARTUP__ = receipt;
				console.log('__NATIVE_BENCH_STARTUP__', JSON.stringify(receipt));
			});
		});
	}, reportRenderFailure);
}
