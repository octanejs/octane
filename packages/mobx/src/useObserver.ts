import { Reaction } from 'mobx';
import { useRef, useSyncExternalStore } from 'octane';
import { subSlot } from './internal';
import { isUsingStaticRendering } from './staticRendering';
import { observerFinalizationRegistry } from './utils/observerFinalizationRegistry';

type ObserverAdministration = {
	reaction: Reaction | null;
	onStoreChange: (() => void) | null;
	stateVersion: symbol;
	name: string;
	subscribe: (onStoreChange: () => void) => () => void;
	getSnapshot: () => symbol;
};

function createReaction(adm: ObserverAdministration): void {
	adm.reaction = new Reaction(`observer${adm.name}`, () => {
		adm.stateVersion = Symbol();
		adm.onStoreChange?.();
	});
}

// Subscription callbacks must not share the render scope: a mounted store
// subscription would otherwise retain its first render result and hook ref.
function createObserverAdministration(baseComponentName: string): ObserverAdministration {
	const adm: ObserverAdministration = {
		reaction: null,
		onStoreChange: null,
		stateVersion: Symbol(),
		name: baseComponentName,
		subscribe(onStoreChange) {
			observerFinalizationRegistry.unregister(adm);
			adm.onStoreChange = onStoreChange;
			if (adm.reaction === null) {
				createReaction(adm);
				adm.stateVersion = Symbol();
			}
			return () => {
				adm.onStoreChange = null;
				adm.reaction?.dispose();
				adm.reaction = null;
			};
		},
		getSnapshot() {
			return adm.stateVersion;
		},
	};
	return adm;
}

function runObserver<T>(render: () => T, baseComponentName: string, slot: symbol | undefined): T {
	if (isUsingStaticRendering()) return render();

	const admRef = useRef<ObserverAdministration | null>(null, subSlot(slot, 'administration'));

	if (admRef.current === null) {
		admRef.current = createObserverAdministration(baseComponentName);
	}

	const adm = admRef.current;
	if (adm.reaction === null) {
		createReaction(adm);
		observerFinalizationRegistry.register(admRef, adm, adm);
	}

	useSyncExternalStore(
		adm.subscribe,
		adm.getSnapshot,
		adm.getSnapshot,
		subSlot(slot, 'external-store'),
	);

	let result!: T;
	let error: unknown;
	let didThrow = false;
	const reaction = adm.reaction;
	if (reaction === null) {
		throw new Error('[@octanejs/mobx] Observer reaction was disposed during render.');
	}
	reaction.track(() => {
		try {
			result = render();
		} catch (caught) {
			didThrow = true;
			error = caught;
		}
	});
	if (didThrow) throw error;
	return result;
}

export function useObserver<T>(render: () => T, baseComponentName?: string): T;
export function useObserver<T>(
	render: () => T,
	baseComponentName: string | symbol = 'observed',
	...rest: [slot?: symbol]
): T {
	const slot =
		typeof rest[rest.length - 1] === 'symbol'
			? rest[rest.length - 1]
			: typeof baseComponentName === 'symbol'
				? baseComponentName
				: undefined;
	return runObserver(
		render,
		typeof baseComponentName === 'string' ? baseComponentName : 'observed',
		slot,
	);
}

export function useObserverWithSlot<T>(
	render: () => T,
	baseComponentName: string,
	slot: symbol,
): T {
	return runObserver(render, baseComponentName, slot);
}
