import { SignalStreamError } from './errors.js';
import type { ScopedNode } from './graph.js';
import {
	sameStreamFrameIdentity,
	type StreamFrameIdentity,
	type StreamedSignalResultFrame,
} from '../streamed-signals-protocol.js';
import type { ScopeImpl } from './engine.js';
import type { ResourceBinding } from './requests.js';

/**
 * Receiver-owned streamed results for one scope. Only the stream ingress
 * functions create this capability, so an owner that never binds a streamed
 * selection allocates none of its maps and retains none of this code.
 *
 * The owner still drives its lifecycle: document suspension expires unfinished
 * channels, resumption rebinds refreshed resources, and disposal clears every
 * channel after the owner is marked retired.
 */
export class ScopeStreams {
	readonly selections = new Map<string, StreamFrameIdentity>();
	private readonly results = new Map<string, StreamedSignalResultFrame[]>();
	private readonly failures = new Map<string, { identity: StreamFrameIdentity; error: Error }>();
	private readonly waiting = new Map<string, { identity: StreamFrameIdentity; ready(): void }>();

	constructor(private readonly owner: ScopeImpl) {}

	/** Mark every unfinished channel expired before cancellation runs user code. */
	suspend(): void {
		for (const key of this.selections.keys()) {
			// A completed pre-activation result is already useful data, even if
			// its descriptor has not executed yet. Only unfinished channels expire.
			if (this.results.get(key)?.at(-1)?.kind === 'complete') continue;
			this.selections.delete(key);
			this.results.delete(key);
			this.waiting.delete(key);
		}
		this.failures.clear();
	}

	/** A refreshed resource may bind the selection that survived suspension. */
	resume(node: ScopedNode, binding: ResourceBinding): void {
		const identity = this.selections.get(node.key);
		if (identity && this.results.has(node.key) && binding.bindStreamedSelection(identity)) {
			this.flush(node, binding);
		}
	}

	clear(): void {
		this.selections.clear();
		this.results.clear();
		this.failures.clear();
		this.waiting.clear();
	}

	bind(identity: StreamFrameIdentity, node: ScopedNode | undefined): boolean {
		const previous = this.selections.get(identity.nodeKey);
		if (previous && !sameStreamFrameIdentity(previous, identity)) {
			this.results.delete(identity.nodeKey);
			this.failures.delete(identity.nodeKey);
			this.waiting.delete(identity.nodeKey);
		}
		this.selections.set(identity.nodeKey, identity);
		if (!node) return true;
		return this.owner.resources?.get(node)?.bindStreamedSelection(identity) === true;
	}

	isPending(identity: StreamFrameIdentity): boolean {
		const selected = this.selections.get(identity.nodeKey);
		const node = this.owner.nodes.get(identity.nodeKey);
		return (
			!this.owner.retired &&
			selected !== undefined &&
			sameStreamFrameIdentity(selected, identity) &&
			node?.kind === 'async' &&
			this.owner.resources?.get(node)?.isStreamedSelectionReady(selected) === false
		);
	}

	whenReady(identity: StreamFrameIdentity, ready: () => void): () => void {
		const node = this.owner.nodes.get(identity.nodeKey);
		if (node && this.owner.resources?.get(node)?.isStreamedSelectionReady(identity))
			return () => {};
		const registration = { identity, ready };
		this.waiting.set(identity.nodeKey, registration);
		return () => {
			if (this.waiting.get(identity.nodeKey) === registration)
				this.waiting.delete(identity.nodeKey);
		};
	}

	selectionReady(binding: ResourceBinding): void {
		if (this.owner.readBarrier !== undefined || this.owner.retired) return;
		this.flush(binding.node, binding);
		const registration = this.waiting.get(binding.node.key);
		if (registration && binding.isStreamedSelectionReady(registration.identity)) {
			this.waiting.delete(binding.node.key);
			registration.ready();
		}
	}

	retainCompleted(identity: StreamFrameIdentity, frames: StreamedSignalResultFrame[]): boolean {
		if (!this.isPending(identity) || frames.at(-1)?.kind !== 'complete') return false;
		const previous = this.results.get(identity.nodeKey);
		if (previous?.at(-1)?.kind === 'complete') return false;
		let sequence = previous?.length ?? 0;
		for (const frame of frames) {
			if (!sameStreamFrameIdentity(identity, frame.identity) || frame.sequence !== sequence++)
				return false;
		}
		if (previous) previous.push(...frames);
		else this.results.set(identity.nodeKey, frames);
		return true;
	}

	discardCompleted(identity: StreamFrameIdentity): void {
		if (
			this.selections.get(identity.nodeKey) !== identity ||
			this.results.get(identity.nodeKey)?.at(-1)?.kind !== 'complete'
		)
			return;
		this.results.delete(identity.nodeKey);
		this.selections.delete(identity.nodeKey);
		this.waiting.delete(identity.nodeKey);
		this.failures.delete(identity.nodeKey);
	}

	accept(frame: StreamedSignalResultFrame): boolean {
		const selected = this.selections.get(frame.identity.nodeKey);
		if (!selected || !sameStreamFrameIdentity(selected, frame.identity)) return false;
		const node = this.owner.nodes.get(frame.identity.nodeKey);
		if (!node) {
			let frames = this.results.get(frame.identity.nodeKey);
			if (!frames) this.results.set(frame.identity.nodeKey, (frames = []));
			frames.push(frame);
			return true;
		}
		if (node.kind !== 'async') return false;
		return this.owner.resources?.get(node)?.acceptStreamed(frame) === true;
	}

	fail(identity: StreamFrameIdentity, error: Error): boolean {
		const selected = this.selections.get(identity.nodeKey);
		if (!selected || !sameStreamFrameIdentity(selected, identity)) return false;
		const node = this.owner.nodes.get(identity.nodeKey);
		if (!node) {
			this.failures.set(identity.nodeKey, { identity, error });
			return true;
		}
		if (node.kind !== 'async') return false;
		return this.owner.resources?.get(node)?.failStreamed(identity, error) === true;
	}

	/** Deliver results that arrived before their resource declaration executed. */
	flush(node: ScopedNode, binding: ResourceBinding): void {
		if (this.owner.readBarrier !== undefined) return;
		const identity = this.selections.get(node.key);
		if (!identity || !binding.isStreamedSelectionReady(identity)) return;
		const frames = this.results.get(node.key);
		if (frames) {
			this.results.delete(node.key);
			for (const frame of frames) {
				if (!binding.acceptStreamed(frame)) {
					binding.failStreamed(identity, new SignalStreamError('identity'));
					break;
				}
			}
		}
		const failure = this.failures.get(node.key);
		if (failure) {
			this.failures.delete(node.key);
			binding.failStreamed(failure.identity, failure.error);
		}
	}
}

export function scopeStreams(owner: ScopeImpl): ScopeStreams {
	return (owner.streams ??= new ScopeStreams(owner));
}
