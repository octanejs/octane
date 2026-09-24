import type { RootOptions } from 'octane';
import {
	bootstrapIndependentHydration,
	registerIndependentHydrationIsland,
	type IndependentHydrateActivator,
	type IndependentHydrateBootstrapOptions,
	type IndependentHydrateManifest,
	type IndependentHydrateRegistration,
} from 'octane/hydration';
import {
	createStreamedRegionPlacementFrame,
	type NativeSignalManifest,
	type NativeSignalReference,
	type RenderOptions,
	type RenderResult,
	type StreamedRegionPlacementOptions,
} from 'octane/server';
import type { StreamFrameIdentity } from 'octane/hydration';
import type { ScopeSeed } from 'octane/signals';

declare const initialDocumentSignals: ScopeSeed;
declare const islandManifest: IndependentHydrateManifest;
declare const placementIdentity: StreamFrameIdentity;
declare const rendered: RenderResult;

export const rendererOptions: RenderOptions = { initialDocumentSignals };
export const rootOptions: RootOptions = { initialDocumentSignals };
export const bootstrapOptions: IndependentHydrateBootstrapOptions = {
	initialDocumentSignals,
	loadModule: async () => ({}),
	loadStyles() {},
};
export const registration: IndependentHydrateRegistration = {
	initialDocumentSignals,
	load: async () => ({}),
	loadStyles() {},
};
export const placementOptions: StreamedRegionPlacementOptions = {
	initialDocumentSignals,
	sequence: 0,
	contentRevision: 1,
};

bootstrapIndependentHydration(document, bootstrapOptions);
registerIndependentHydrationIsland(document.createElement('div'), islandManifest, registration);
createStreamedRegionPlacementFrame(placementIdentity, rendered, placementOptions);

export const activator: IndependentHydrateActivator = (context) => {
	const immutableSeed: ScopeSeed | undefined = context.initialDocumentSignals;
	return { unmount() {} };
};

const missingScope = { version: 1 as const, entries: [] };
// @ts-expect-error — renderer adoption requires a complete scope seed.
const invalidRenderer: RenderOptions['initialDocumentSignals'] = missingScope;
// @ts-expect-error — root adoption requires a complete scope seed.
const invalidRoot: RootOptions['initialDocumentSignals'] = missingScope;
// @ts-expect-error — independent bootstrap keeps the same scope seed contract.
const invalidBootstrap: IndependentHydrateBootstrapOptions['initialDocumentSignals'] = missingScope;
// @ts-expect-error — registration keeps the seed precise through asynchronous loading.
const invalidRegistration: IndependentHydrateRegistration['initialDocumentSignals'] = missingScope;
// @ts-expect-error — placement resolves renderer references from a complete scope seed.
const invalidPlacement: StreamedRegionPlacementOptions['initialDocumentSignals'] = missingScope;

export const standalone: NativeSignalManifest = { version: 1, scopes: [initialDocumentSignals] };
export const compact: NativeSignalManifest = {
	version: 2,
	scopes: [],
	initialDocument: {
		scopeKey: 'document',
		entries: [
			{ key: 'route', read: 'value' },
			{ key: 'retained-route', read: 'latest' },
			{ key: 'route-state', read: 'snapshot' },
		],
	},
};

type Reference = Extract<
	NativeSignalManifest,
	{ version: 2 }
>['initialDocument']['entries'][number];
const valueReference: Reference = { key: 'route', read: 'value' };
const exportedReference: NativeSignalReference = valueReference;
// @ts-expect-error — references use the exact public native read channels.
const invalidReference: Reference = { key: 'route', read: 'get' };
// @ts-expect-error — every reference identifies its read channel explicitly.
const missingChannel: Reference = { key: 'route' };
// @ts-expect-error — a compact manifest requires its initial document references.
const missingDocument: NativeSignalManifest = { version: 2, scopes: [] };
const mixedVersions: NativeSignalManifest = {
	version: 1,
	scopes: [],
	// @ts-expect-error — a standalone manifest has no initial document reference field.
	initialDocument: compact.initialDocument,
};
// @ts-expect-error — transport references are immutable.
compact.initialDocument.entries[0].read = 'latest';

export function consumeManifest(manifest: NativeSignalManifest): readonly ScopeSeed[] {
	if (manifest.version === 2) {
		const references: readonly Reference[] = manifest.initialDocument.entries;
		const scopeKey: string = manifest.initialDocument.scopeKey;
	} else {
		const version: 1 = manifest.version;
		// @ts-expect-error — discriminating version 1 excludes reference metadata.
		manifest.initialDocument;
	}
	return manifest.scopes;
}
