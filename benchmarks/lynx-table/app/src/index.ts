import { root } from '@octanejs/lynx';

import { App } from './App.lynx.tsrx';
import './app.css';

interface BenchmarkSnapshot {
	readonly rowCount: number;
	readonly firstId: number | null;
	readonly secondId: number | null;
	readonly thirdId: number | null;
	readonly row998Id: number | null;
	readonly firstLabel: string | null;
	readonly selectedId: number | null;
}

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
	readonly postState: BenchmarkSnapshot;
}

type BenchmarkGlobal = typeof globalThis & {
	__LYNX_BENCH_ERROR__?: string;
	__LYNX_BENCH_SNAPSHOT__?: () => BenchmarkSnapshot;
	__LYNX_BENCH_STARTUP__?: NativeStartupReceipt;
};

const benchmarkGlobal = globalThis as BenchmarkGlobal;
const moduleStartMs = Date.now();
const rendering = root.render(App);

// The generated main-thread entry returns synchronously. Only the background
// root returns the transport acknowledgement promise used by the producer
// receipt, so the engine receives one receipt from the successful live root.
if (rendering !== null && typeof rendering === 'object' && 'then' in rendering) {
	void rendering.then(
		() => {
			const commitAckMs = Date.now();
			lynx.requestAnimationFrame(() => {
				const firstFrameMs = Date.now();
				lynx.requestAnimationFrame(() => {
					const secondFrameMs = Date.now();
					const postState = benchmarkGlobal.__LYNX_BENCH_SNAPSHOT__?.();
					if (postState === undefined) {
						benchmarkGlobal.__LYNX_BENCH_ERROR__ =
							'Octane Native startup completed without a semantic snapshot.';
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
		},
		(error: unknown) => {
			benchmarkGlobal.__LYNX_BENCH_ERROR__ =
				error instanceof Error ? (error.stack ?? error.message) : String(error);
		},
	);
}
