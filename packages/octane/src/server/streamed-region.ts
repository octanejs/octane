import type { RenderResult } from '../runtime.server.js';
import {
	isStreamedRendererFrame,
	type StreamFrameIdentity,
	type StreamedRegionPlacementFrame,
} from '../streamed-signals-protocol.js';

export interface StreamedRegionPlacementOptions {
	readonly sequence: number;
	readonly contentRevision: number;
	/** Completed-build stylesheet URLs; the receiver waits for them before reveal. */
	readonly styles?: readonly string[];
}

/**
 * Package a completed renderer snapshot for an explicitly registered dormant
 * region. Render under the region's request owner; never reuse cached response
 * HTML with a different document, owner, or selection envelope. Cache source
 * data instead. The current protocol admits one data owner per region.
 */
export function createStreamedRegionPlacementFrame(
	identity: StreamFrameIdentity,
	rendered: RenderResult,
	options: StreamedRegionPlacementOptions,
): StreamedRegionPlacementFrame {
	const scopes = rendered.signals?.scopes;
	if (scopes?.length !== 1 || scopes[0].scopeKey !== identity.ownerKey) {
		throw new TypeError('A streamed region requires the exact historical signal owner.');
	}
	if (rendered.head) {
		throw new TypeError('A streamed region cannot replace document head metadata.');
	}
	const frame: StreamedRegionPlacementFrame = {
		identity: { ...identity },
		sequence: options.sequence,
		channel: 'placement',
		kind: 'html',
		contentRevision: options.contentRevision,
		mode: 'full',
		// Scoped CSS is part of the same atomic candidate and precedes its users.
		// The outer pair belongs to the receiver, not to the component's layout.
		html: '<!--[-->' + rendered.css + rendered.html + '<!--]-->',
		historicalFrame: scopes[0],
		styles: options.styles === undefined ? [] : [...options.styles],
	};
	if (!isStreamedRendererFrame(frame)) throw new TypeError('Invalid streamed region snapshot.');
	return frame;
}
