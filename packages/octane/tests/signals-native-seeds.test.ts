import { describe, expect, it, vi } from 'vitest';
import { SignalSerializationError } from '../src/signals/errors.js';
import {
	captureInitialDocumentSignals,
	materializeNativeSignalManifest,
	parseNativeSignalManifest,
	serializeNativeSeedReads,
	type NativeSignalManifest,
	type NativeSignalReference,
} from '../src/signals/native-read-seeds.js';
import type { NativeReadWitness } from '../src/signals/native-read-collector.js';
import type { NativeAdoptionOwner, NativeReadSource } from '../src/signals/read-protocol.js';
import type { EncodedSignalValue, ScopeSeed, SignalSeedEntry } from '../src/signals/types.js';

const documentKey = 'octane:document';

function entry(key = 'route', value: EncodedSignalValue = ['string', 'thread']): SignalSeedEntry {
	return { key, kind: 'signal', value, complete: true };
}

function seed(entries: readonly SignalSeedEntry[], scopeKey = documentKey): ScopeSeed {
	return { version: 1, scopeKey, entries };
}

function manifest(
	entries: readonly NativeSignalReference[] = [{ key: 'route', read: 'value' }],
	scopes: readonly ScopeSeed[] = [],
): Extract<NativeSignalManifest, { readonly version: 2 }> {
	return { version: 2, scopes, initialDocument: { scopeKey: documentKey, entries } };
}

/** A transport producer supplies already observed data without a signal graph. */
function witness(history: ScopeSeed): NativeReadWitness {
	const owner: NativeAdoptionOwner = {
		scopeKey: history.scopeKey,
		beginAdoption() {
			throw new Error('Serializing wire data must not begin adoption.');
		},
	};
	const source: NativeReadSource = {
		getVersion: () => 0,
		subscribe: () => () => {},
		serialize: () => [{ owner, seed: history }],
	};
	return { reads: new Map([[source, 0]]), mixed: false };
}

function serialize(history: ScopeSeed, initial: ScopeSeed): NativeSignalManifest | undefined {
	return serializeNativeSeedReads(
		witness(history),
		captureInitialDocumentSignals(initial, documentKey),
	);
}

describe('native initial document signal transport', () => {
	it('keeps version 1 transport when no initial history is referenced', () => {
		const history = seed([entry()]);
		const expected = { version: 1, scopes: [history] };
		expect(serializeNativeSeedReads(witness(history))).toEqual(expected);
		expect(serialize(history, seed([entry('route', ['string', 'home'])]))).toEqual(expected);
		expect(
			materializeNativeSignalManifest(parseNativeSignalManifest(JSON.stringify(expected))),
		).toEqual(expected);
	});

	it('matches complete encoded entries independently of object property order', () => {
		const history = seed([entry()]);
		const initial = seed([
			{ complete: true, value: ['string', 'thread'], kind: 'signal', key: 'route' },
		]);
		const serialized = serialize(history, initial);
		expect(serialized).toEqual(manifest());
		expect(
			materializeNativeSignalManifest(
				parseNativeSignalManifest(JSON.stringify(serialized)),
				initial,
			),
		).toEqual({
			version: 1,
			scopes: [history],
		});
	});

	it.each(['initial', 'boundary'] as const)(
		'normalizes an explicit value read in the %s seed to the omitted strict channel',
		(location) => {
			const explicit = { ...entry(), read: 'value' } as unknown as SignalSeedEntry;
			const history = seed([location === 'boundary' ? explicit : entry()]);
			const initial = seed([location === 'initial' ? explicit : entry()]);
			expect(serialize(history, initial)).toEqual(manifest());
		},
	);

	it.each<{ name: string; value: EncodedSignalValue }>([
		{ name: 'undefined', value: ['undefined'] },
		{ name: 'negative zero', value: ['number', '-0'] },
		{ name: 'a string resembling a number tag', value: ['string', '-0'] },
		{ name: 'nested tagged data', value: ['array', [['undefined'], ['number', '-0'], ['null']]] },
		{
			name: 'prototype-named properties',
			value: [
				'object',
				[
					['__proto__', ['boolean', true]],
					['constructor', ['string', 'data']],
				],
			],
		},
	])('round-trips references without changing $name', ({ value }) => {
		const history = seed([entry('route', value)]);
		const initial = seed([entry('route', value)]);
		const serialized = serialize(history, initial)!;
		expect(serialized).toEqual(manifest());
		expect(
			materializeNativeSignalManifest(
				parseNativeSignalManifest(JSON.stringify(serialized)),
				initial,
			),
		).toEqual({
			version: 1,
			scopes: [history],
		});
	});

	it.each<{ name: string; observed: EncodedSignalValue; initial: EncodedSignalValue }>([
		{ name: 'negative and positive zero', observed: ['number', '-0'], initial: ['number', 0] },
		{ name: 'undefined and null', observed: ['undefined'], initial: ['null'] },
		{ name: 'number and string tags', observed: ['number', '-0'], initial: ['string', '-0'] },
	])('keeps $name as distinct boundary history', ({ observed, initial }) => {
		const history = seed([entry('route', observed)]);
		expect(serialize(history, seed([entry('route', initial)]))).toEqual({
			version: 1,
			scopes: [history],
		});
	});

	it('serializes matching references together with distinct boundary entries', () => {
		const detail = entry('detail', ['string', 'boundary history']);
		const history = seed([entry(), detail]);
		const initial = seed([
			entry(),
			entry('detail', ['string', 'initial history']),
			entry('unused'),
		]);
		expect(serialize(history, initial)).toEqual(manifest(undefined, [seed([detail])]));
	});

	it.each(['value', 'latest', 'snapshot'] as const)(
		'emits an explicit %s reference only for the matching read channel',
		(read) => {
			const observed = read === 'value' ? entry() : { ...entry(), read };
			const history = seed([observed]);
			expect(serialize(history, seed([observed]))).toEqual(manifest([{ key: 'route', read }]));
			const other = read === 'value' ? { ...entry(), read: 'latest' as const } : entry();
			expect(serialize(history, seed([other]))).toEqual({ version: 1, scopes: [history] });
		},
	);

	it('matches every query identity and historical state field conservatively', () => {
		const observed: SignalSeedEntry = {
			key: 'result',
			kind: 'async',
			read: 'latest',
			available: true,
			value: ['string', 'ready'],
			complete: false,
			refreshing: false,
			connection: 'open',
			request: { queryKey: 'route-results', kind: 'stream', argument: ['string', 'thread'] },
		};
		const history = seed([observed]);
		const reordered: SignalSeedEntry = {
			request: { argument: ['string', 'thread'], kind: 'stream', queryKey: 'route-results' },
			connection: 'open',
			refreshing: false,
			complete: false,
			value: ['string', 'ready'],
			available: true,
			read: 'latest',
			kind: 'async',
			key: 'result',
		};
		expect(serialize(history, seed([reordered]))).toEqual(
			manifest([{ key: 'result', read: 'latest' }]),
		);
		const alternatives: SignalSeedEntry[] = [
			{ ...observed, complete: true },
			{ ...observed, refreshing: true },
			{ ...observed, connection: 'closed' },
			{ ...observed, available: undefined },
			{ ...observed, request: { ...observed.request!, queryKey: 'other-results' } },
			{ ...observed, request: { ...observed.request!, kind: 'promise' } },
			{ ...observed, request: { ...observed.request!, argument: ['string', 'home'] } },
		];
		for (const alternative of alternatives) {
			expect(serialize(history, seed([alternative]))).toEqual({ version: 1, scopes: [history] });
		}
	});

	it('keeps matching references alongside distinct document history and other scope history', () => {
		const initial = seed([entry(), entry('unused'), { ...entry('route'), read: 'latest' }]);
		const documentDelta = seed([entry('detail', ['string', 'boundary history'])]);
		const account = seed([entry('name', ['string', 'Ada'])], 'account');
		const narrowed = materializeNativeSignalManifest(
			manifest(undefined, [documentDelta, account]),
			initial,
		);
		expect(narrowed).toEqual({
			version: 1,
			scopes: [account, seed([entry(), ...documentDelta.entries])],
		});
	});

	it.each<{ name: string; document: unknown }>([
		{ name: 'missing document', document: undefined },
		{ name: 'null document', document: null },
		{ name: 'missing entries', document: { scopeKey: documentKey } },
		{ name: 'non-array entries', document: { scopeKey: documentKey, entries: {} } },
		{ name: 'empty entries', document: { scopeKey: documentKey, entries: [] } },
		{
			name: 'empty scope key',
			document: { scopeKey: '', entries: [{ key: 'route', read: 'value' }] },
		},
		{
			name: 'blank scope key',
			document: { scopeKey: ' ', entries: [{ key: 'route', read: 'value' }] },
		},
	])('rejects a $name reference container', ({ document }) => {
		expect(() =>
			parseNativeSignalManifest(
				JSON.stringify({ version: 2, scopes: [], initialDocument: document }),
			),
		).toThrow(/initial document signal references/);
	});

	it.each<{ name: string; reference: unknown }>([
		{ name: 'null', reference: null },
		{ name: 'non-object', reference: 1 },
		{ name: 'missing key', reference: { read: 'value' } },
		{ name: 'empty key', reference: { key: '', read: 'value' } },
		{ name: 'blank key', reference: { key: ' ', read: 'value' } },
		{ name: 'non-string key', reference: { key: 1, read: 'value' } },
		{ name: 'missing channel', reference: { key: 'route' } },
		{ name: 'unknown channel', reference: { key: 'route', read: 'retained' } },
		{ name: 'null channel', reference: { key: 'route', read: null } },
	])('rejects a $name reference', ({ reference }) => {
		const raw = JSON.stringify({
			version: 2,
			scopes: [],
			initialDocument: { scopeKey: documentKey, entries: [reference] },
		});
		expect(() => parseNativeSignalManifest(raw)).toThrow(/initial document signal reference/);
	});

	it('rejects duplicate references while accepting distinct channels for the same key', () => {
		const duplicate = manifest([
			{ key: 'route', read: 'value' },
			{ key: 'route', read: 'value' },
		]);
		expect(() => parseNativeSignalManifest(JSON.stringify(duplicate))).toThrow(/duplicate/);
		expect(() => materializeNativeSignalManifest(duplicate, seed([entry()]))).toThrow(/duplicate/);
		const channels = manifest([
			{ key: 'route', read: 'value' },
			{ key: 'route', read: 'latest' },
		]);
		expect(parseNativeSignalManifest(JSON.stringify(channels))).toEqual(channels);
	});

	it('validates direct manifests before resolving their references', () => {
		const invalid = manifest([{ key: 'route' } as NativeSignalReference]);
		expect(() => materializeNativeSignalManifest(invalid, seed([entry()]))).toThrow(
			/signal reference/,
		);
	});

	it('requires the correct initial document seed and an exact referenced entry', () => {
		expect(() => materializeNativeSignalManifest(manifest())).toThrow(
			/requires its initial document signal seed/,
		);
		expect(() =>
			materializeNativeSignalManifest(manifest(), seed([entry()], 'other-document')),
		).toThrow(/matching/);
		expect(() => materializeNativeSignalManifest(manifest(), seed([entry('unused')]))).toThrow(
			/signal reference/,
		);
		expect(() =>
			materializeNativeSignalManifest(
				manifest([{ key: 'route', read: 'snapshot' }]),
				seed([entry()]),
			),
		).toThrow(/signal reference/);
	});

	it('rejects overlapping references, duplicate document deltas, and duplicate scopes', () => {
		const initial = seed([entry()]);
		expect(() =>
			materializeNativeSignalManifest(manifest(undefined, [seed([entry()])]), initial),
		).toThrow(/Overlapping/);
		expect(() =>
			materializeNativeSignalManifest(
				manifest(undefined, [seed([entry('detail'), entry('detail')])]),
				initial,
			),
		).toThrow(/Overlapping/);
		expect(() =>
			materializeNativeSignalManifest(
				manifest(undefined, [seed([entry('a')]), seed([entry('b')])]),
				initial,
			),
		).toThrow(/duplicate native signal hydration scope/);
	});

	it('captures immutable history before caller mutations', () => {
		const value: ['string', string] = ['string', 'thread'];
		const entries = [entry('route', value)];
		const initial = captureInitialDocumentSignals(seed(entries), documentKey);
		value[1] = 'home';
		entries.push(entry('unused'));
		expect(materializeNativeSignalManifest(manifest(), initial)).toEqual({
			version: 1,
			scopes: [seed([entry()])],
		});
		expect(() => {
			(initial.entries[0]!.value as ['string', string])[1] = 'changed';
		}).toThrow(TypeError);
	});

	it('rejects duplicate normalized channels in an initial document seed', () => {
		const explicit = { ...entry(), read: 'value' } as unknown as SignalSeedEntry;
		expect(() => captureInitialDocumentSignals(seed([entry(), explicit]), documentKey)).toThrow(
			/unique, valid node entries/,
		);
	});

	it.each<{ name: string; invalid: unknown }>([
		{ name: 'blank key', invalid: { ...entry(), key: ' ' } },
		{ name: 'unknown channel', invalid: { ...entry(), read: 'retained' } },
		{ name: 'unknown kind', invalid: { ...entry(), kind: 'value' } },
		{ name: 'non-boolean completion', invalid: { ...entry(), complete: 'yes' } },
		{ name: 'non-array encoded value', invalid: { ...entry(), value: 'thread' } },
	])('rejects an initial entry with a $name', ({ invalid }) => {
		expect(() =>
			captureInitialDocumentSignals(seed([invalid as SignalSeedEntry]), documentKey),
		).toThrow(/valid node entries/);
	});

	it.each<{ name: string; value: unknown }>([
		{ name: 'unknown tag', value: ['unknown'] },
		{ name: 'extra undefined payload', value: ['undefined', 'data'] },
		{ name: 'raw negative zero', value: ['number', -0] },
		{ name: 'incorrect boolean payload', value: ['boolean', 'true'] },
		{ name: 'malformed nested array', value: ['array', [['unknown']]] },
		{
			name: 'unordered object entries',
			value: [
				'object',
				[
					['z', ['null']],
					['a', ['null']],
				],
			],
		},
	])('rejects a malformed encoded value with an $name before adoption', ({ value }) => {
		expect(() =>
			captureInitialDocumentSignals(
				seed([entry('route', value as EncodedSignalValue)]),
				documentKey,
			),
		).toThrow(SignalSerializationError);
	});

	it.each<{ argument: unknown }>([
		{ argument: ['unknown'] },
		{ argument: ['array', [['number', '-zero']]] },
	])('rejects a malformed encoded query argument before adoption', ({ argument }) => {
		const result: SignalSeedEntry = {
			...entry('result'),
			kind: 'async',
			request: {
				queryKey: 'route-results',
				kind: 'promise',
				argument: argument as EncodedSignalValue,
			},
		};
		expect(() => captureInitialDocumentSignals(seed([result]), documentKey)).toThrow(
			SignalSerializationError,
		);
	});

	it.each(['scope', 'entry', 'encoded value'] as const)(
		'rejects an accessor in the initial %s without executing its getter',
		(location) => {
			const value: ['string', string] = ['string', 'thread'];
			const node = entry('route', value);
			const initial = seed([node]);
			const target = location === 'scope' ? initial : location === 'entry' ? node : value;
			const property = location === 'scope' ? 'entries' : location === 'entry' ? 'value' : '1';
			const getter = vi.fn(() => {
				throw new Error('The accessor was executed.');
			});
			Object.defineProperty(target, property, { enumerable: true, get: getter });
			expect(() => captureInitialDocumentSignals(initial, documentKey)).toThrow(
				SignalSerializationError,
			);
			expect(getter).not.toHaveBeenCalled();
		},
	);
});
