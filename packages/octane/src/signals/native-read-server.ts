import { createNativeReadCollector, type NativeReadWitness } from './native-read-collector.js';
import {
	mergeNativeSeedReads,
	rewindNativeSeedReads,
	serializeNativeSeedReads,
	type NativeSeedReads,
} from './native-read-seeds.js';

interface ServerFrame {
	collectorToken: number;
	reads: NativeSeedReads | null;
}

interface PassFrame {
	base: number;
	collectorToken: number;
}

/** Failed server branches cannot contribute seeds for markup they did not emit. */
export function createNativeServerReadDriver(
	record: (reads: NativeReadWitness) => void,
	recordFailure: () => void,
) {
	const frames: ServerFrame[] = [];
	const passes: PassFrame[] = [];
	let depth = 0;
	let passDepth = 0;
	let base = 0;
	const collector = createNativeReadCollector((_owner, source, version) => {
		const frame = frames[depth - 1];
		if (frame === undefined) return;
		const reads = (frame.reads ??= { reads: new Map(), mixed: false });
		const previous = reads.reads.get(source);
		if (previous === undefined) reads.reads.set(source, version);
		else if (previous !== version) reads.mixed = true;
	});
	function append(reads: NativeReadWitness): void {
		if (depth === base) record(reads);
		else frames[depth - 1].reads = mergeNativeSeedReads(frames[depth - 1].reads, reads);
	}
	return {
		merge: mergeNativeSeedReads,
		rewindReads: rewindNativeSeedReads,
		serialize: serializeNativeSeedReads,
		isDetached: collector.isDetached,
		pauseLifecycle: () => collector.suspend(true),
		resumeLifecycle: (token: number) => collector.resume(token, true),
		checkpoint() {
			if (depth === base) return null;
			const frame = frames[depth - 1];
			const reads = frame.reads;
			return { frame, reads, size: reads?.reads.size ?? 0, mixed: reads?.mixed ?? false };
		},
		rewind(checkpoint: {
			frame: ServerFrame;
			reads: NativeSeedReads | null;
			size: number;
			mixed: boolean;
		}): void {
			checkpoint.frame.reads = checkpoint.reads;
			rewindNativeSeedReads(checkpoint.reads, checkpoint.size, checkpoint.mixed);
		},
		beginPass(): number {
			const token = passDepth++;
			const pass = (passes[token] ??= { base: 0, collectorToken: -1 });
			pass.base = base;
			pass.collectorToken = collector.beginRender();
			base = depth;
			return token;
		},
		endPass(token: number): void {
			const pass = passes[token];
			base = pass.base;
			passDepth = token;
			collector.endRender(pass.collectorToken);
		},
		beginScope(owner: object): number {
			const token = depth++;
			const frame = (frames[token] ??= { collectorToken: -1, reads: null });
			frame.reads = null;
			frame.collectorToken = collector.beginScope(owner);
			return token;
		},
		endScope(token: number, completed: boolean): void {
			const frame = frames[token];
			const reads = frame.reads;
			frame.reads = null;
			depth = token;
			try {
				if (completed && reads !== null) append(reads);
				else if (!completed && reads !== null) recordFailure();
			} finally {
				collector.endScope(frame.collectorToken);
			}
		},
		/** A renderer boundary may emit its successful body in a later segment. */
		beginCapture(): number {
			const token = depth++;
			const frame = (frames[token] ??= { collectorToken: -1, reads: null });
			frame.collectorToken = -1;
			frame.reads = null;
			return token;
		},
		finishCapture(token: number, merge: boolean): NativeSeedReads | null {
			const frame = frames[token];
			const reads = frame.reads;
			frame.reads = null;
			depth = token;
			if (merge && reads !== null) append(reads);
			return reads;
		},
		append,
		beginWitness: collector.beginWitness,
		finishWitness: collector.finishWitness,
		replay: collector.replay,
	};
}
