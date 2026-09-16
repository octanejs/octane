import {
	createStreamedResultReceiver,
	type StreamedRegionRegistration,
	type StreamedResultReceiver,
} from 'octane/hydration';
import {
	bootstrapStreamedSignalHydration,
	bootstrapStreamedSignalResults,
	type StreamedSignalHydration,
	type StreamedSignalResults,
} from 'octane/hydration/streamed-signals';

const options = { buildId: 'build', documentId: 'document' };
const results = bootstrapStreamedSignalResults(options);
const resultLifecycle: StreamedSignalResults = results;
const resultReceiver: StreamedResultReceiver = results.receiver;
resultLifecycle.suspend();
resultLifecycle.dispose();

const standalone = createStreamedResultReceiver({ ...options, ownerKey: 'owner' });
const sameReceiverContract: StreamedResultReceiver = standalone;

declare const region: StreamedRegionRegistration;
const full = bootstrapStreamedSignalHydration(options);
const fullLifecycle: StreamedSignalHydration = full;
const fullResults: StreamedSignalResults = full;
const detachRegion: () => void = fullLifecycle.receiver.registerRegion(region);

// @ts-expect-error — hosts using results-only hydration own their HTML placement.
results.receiver.registerRegion(region);
// @ts-expect-error — the standalone result receiver has the same placement boundary.
standalone.registerRegion(region);
// @ts-expect-error — a result lifecycle cannot promise region registration.
const missingPlacement: StreamedSignalHydration = results;
// @ts-expect-error — document authority is mandatory for both bootstrap variants.
bootstrapStreamedSignalResults({ buildId: 'build' });
// @ts-expect-error — selection authority requires the complete frame identity.
resultReceiver.registerSelection({ buildId: 'build', documentId: 'document' });
