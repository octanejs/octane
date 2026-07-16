import { Dexie } from 'dexie';
import { useEffect, useRef } from 'octane';
import { splitSlot, subSlot } from './internal';

export interface DexieYProvider<TDoc extends object = object> {
	doc: TDoc;
}

interface DexieYProviderConstructor<TDoc extends object> {
	load(doc: TDoc, options: { gracePeriod: number }): DexieYProvider<TDoc>;
	for(doc: TDoc): DexieYProvider<TDoc> | undefined;
	release(doc: TDoc): void;
}

type DexieWithYProvider = Dexie & {
	DexieYProvider?: DexieYProviderConstructor<object>;
};

const gracePeriod = 100;
const getProviderConstructor = () =>
	(Dexie as unknown as DexieWithYProvider).DexieYProvider as
		| DexieYProviderConstructor<object>
		| undefined;

const finalizationRegistry =
	typeof FinalizationRegistry !== 'undefined'
		? new FinalizationRegistry<object>((doc) => {
				getProviderConstructor()?.release(doc);
			})
		: undefined;

export function useDocument<TDoc extends object>(
	doc: TDoc | null | undefined,
	...rest: [symbol?]
): DexieYProvider<TDoc> | null {
	const [args, slot] = splitSlot(rest);
	if (args.length !== 0) {
		throw new TypeError('useDocument() accepts one document argument.');
	}
	if (!finalizationRegistry) {
		throw new TypeError('useDocument() requires FinalizationRegistry support.');
	}

	const providerConstructor = getProviderConstructor() as
		| DexieYProviderConstructor<TDoc>
		| undefined;
	if (!providerConstructor) {
		throw new Error(
			'DexieYProvider is not available. Make sure y-dexie is installed and imported.',
		);
	}

	const providerRef = useRef<DexieYProvider<TDoc> | null>(null, subSlot(slot, 'document:provider'));
	const unregisterTokenRef = useRef<object | undefined>(
		undefined,
		subSlot(slot, 'document:unregister'),
	);

	if (doc) {
		if (doc !== providerRef.current?.doc) {
			providerRef.current = providerConstructor.load(doc, { gracePeriod });
			unregisterTokenRef.current = Object.create(null);
			finalizationRegistry.register(providerRef, doc, unregisterTokenRef.current);
		}
	} else if (providerRef.current?.doc) {
		providerRef.current = null;
	}

	useEffect(
		() => {
			if (!doc) return;
			if (unregisterTokenRef.current) {
				finalizationRegistry.unregister(unregisterTokenRef.current);
				unregisterTokenRef.current = undefined;
			}
			const provider = providerConstructor.for(doc);
			if (!provider) {
				throw new Error(
					'DexieYProvider.release() was called before useDocument() could take ownership.',
				);
			}
			return () => providerConstructor.release(doc);
		},
		[doc],
		subSlot(slot, 'document:effect'),
	);

	return providerRef.current;
}
