// Ported from react-i18next@17.0.9 (8b4a9ea). The subscription contract maps
// directly to octane; Suspense unwraps through use(thenable) instead of a raw
// Promise throw, and composed base hooks receive deterministic sub-slots.
import {
	use,
	useContext,
	useCallback,
	useMemo,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'octane';
import { getI18n, getDefaults, ReportNamespaces, I18nContext } from './context.js';
import {
	warnOnce,
	loadNamespaces,
	loadLanguages,
	hasLoadedNamespace,
	isString,
	isObject,
} from './utils.js';
import { splitSlot, subSlot } from './internal.js';

const notReadyT = (k, optsOrDefaultValue) => {
	if (isString(optsOrDefaultValue)) return optsOrDefaultValue;
	if (isObject(optsOrDefaultValue) && isString(optsOrDefaultValue.defaultValue))
		return optsOrDefaultValue.defaultValue;
	// Selector functions and arrays of selector functions cannot be meaningfully resolved
	// before i18n is ready — return empty string rather than leaking a function reference.
	if (typeof k === 'function') return '';
	if (Array.isArray(k)) {
		const last = k[k.length - 1];
		return typeof last === 'function' ? '' : last;
	}
	return k;
};

const notReadySnapshot = { t: notReadyT, ready: false };
const dummySubscribe = () => () => {};

// An initial client render that suspends may discard hook memo state. Cache the
// backend load outside the render scope so replay always sees the same thenable;
// it is evicted after settlement, by which point i18next reports the namespace
// ready. Sharing by instance/language/namespaces also coalesces sibling consumers.
const suspenseLoadCache = new WeakMap();

const getSuspenseLoadPromise = (i18n, lng, namespaces) => {
	let byRequest = suspenseLoadCache.get(i18n);
	if (!byRequest) {
		byRequest = new Map();
		suspenseLoadCache.set(i18n, byRequest);
	}
	const key = `${lng || ''}\u0000${namespaces.join('\u0001')}`;
	let promise = byRequest.get(key);
	if (!promise) {
		promise = new Promise((resolve) => {
			if (lng) loadLanguages(i18n, lng, namespaces, resolve);
			else loadNamespaces(i18n, namespaces, resolve);
		});
		byRequest.set(key, promise);
		promise.finally(() => {
			if (byRequest.get(key) === promise) byRequest.delete(key);
		});
	}
	return promise;
};

export const useTranslation = (...args) => {
	const [user, slot] = splitSlot(args);
	const ns = user[0];
	const props = user[1] || {};
	const { i18n: i18nFromProps } = props;
	const { i18n: i18nFromContext, defaultNS: defaultNSFromContext } = useContext(I18nContext) || {};
	const i18n = i18nFromProps || i18nFromContext || getI18n();

	if (i18n && !i18n.reportNamespaces) i18n.reportNamespaces = new ReportNamespaces();

	if (!i18n) {
		warnOnce(
			i18n,
			'NO_I18NEXT_INSTANCE',
			'useTranslation: You will need to pass in an i18next instance by using initReactI18next',
		);
	}

	const i18nOptions = useMemo(
		() => ({ ...getDefaults(), ...i18n?.options?.react, ...props }),
		[i18n, props],
		subSlot(slot, 'ut:options'),
	);

	const { useSuspense, keyPrefix } = i18nOptions;

	const nsOrContext = ns || defaultNSFromContext || i18n?.options?.defaultNS;
	const unstableNamespaces = isString(nsOrContext) ? [nsOrContext] : nsOrContext || ['translation'];
	const namespaces = useMemo(
		() => unstableNamespaces,
		unstableNamespaces,
		subSlot(slot, 'ut:namespaces'),
	);

	i18n?.reportNamespaces?.addUsedNamespaces?.(namespaces);

	const revisionRef = useRef(0, subSlot(slot, 'ut:revision'));
	const subscribe = useCallback(
		(callback) => {
			if (!i18n) return dummySubscribe;
			const { bindI18n, bindI18nStore } = i18nOptions;

			const wrappedCallback = () => {
				revisionRef.current += 1;
				callback();
			};

			if (bindI18n) i18n.on(bindI18n, wrappedCallback);
			if (bindI18nStore) i18n.store.on(bindI18nStore, wrappedCallback);
			return () => {
				if (bindI18n) bindI18n.split(' ').forEach((e) => i18n.off(e, wrappedCallback));
				if (bindI18nStore)
					bindI18nStore.split(' ').forEach((e) => i18n.store.off(e, wrappedCallback));
			};
		},
		[i18n, i18nOptions],
		subSlot(slot, 'ut:subscribe'),
	);

	const snapshotRef = useRef(undefined, subSlot(slot, 'ut:snapshotRef'));
	const getSnapshot = useCallback(
		() => {
			if (!i18n) {
				return notReadySnapshot;
			}
			const calculatedReady =
				!!(i18n.isInitialized || i18n.initializedStoreOnce) &&
				namespaces.every((n) => hasLoadedNamespace(n, i18n, i18nOptions));
			const currentLng = props.lng || i18n.language;
			const currentRevision = revisionRef.current;

			const lastSnapshot = snapshotRef.current;
			if (
				lastSnapshot &&
				lastSnapshot.ready === calculatedReady &&
				lastSnapshot.lng === currentLng &&
				lastSnapshot.keyPrefix === keyPrefix &&
				lastSnapshot.revision === currentRevision // Check revision
			) {
				return lastSnapshot;
			}

			// `scopeNs` (4th opts arg, i18next ≥ 26.0.10) gives the selector API access
			// to the full hook namespace list while `ns` (resolution-scope) stays at
			// the primary string. Without it, `t($ => $.secondaryNs.foo)` would silently
			// miss under default `nsMode` because `o.ns` is a single string and i18next's
			// selector rewrite only fires on multi-ns input.
			const calculatedT = i18n.getFixedT(
				currentLng,
				i18nOptions.nsMode === 'fallback' ? namespaces : namespaces[0],
				keyPrefix,
				{ scopeNs: namespaces },
			);

			const newSnapshot = {
				t: calculatedT,
				ready: calculatedReady,
				lng: currentLng,
				keyPrefix,
				revision: currentRevision, // Store revision
			};
			snapshotRef.current = newSnapshot;
			return newSnapshot;
		},
		[i18n, namespaces, keyPrefix, i18nOptions, props.lng],
		subSlot(slot, 'ut:snapshot'),
	);

	// We still need a state to manually trigger a re-render on load when the store doesn't emit an event.
	const [loadCount, setLoadCount] = useState(0, subSlot(slot, 'ut:loadCount'));
	const { t, ready } = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot,
		subSlot(slot, 'ut:externalStore'),
	);

	useEffect(
		() => {
			if (i18n && !ready && !useSuspense) {
				const onLoaded = () => setLoadCount((c) => c + 1);
				if (props.lng) {
					loadLanguages(i18n, props.lng, namespaces, onLoaded);
				} else {
					loadNamespaces(i18n, namespaces, onLoaded);
				}
			}
		},
		[i18n, props.lng, namespaces, ready, useSuspense, loadCount],
		subSlot(slot, 'ut:load'),
	);

	const finalI18n = i18n || {};

	// cache one wrapper per hook caller and only recreate it when language changes
	const wrapperRef = useRef(null, subSlot(slot, 'ut:wrapper'));
	const wrapperLangRef = useRef(undefined, subSlot(slot, 'ut:wrapperLang'));

	// helper to create a wrapper instance (avoid duplicating descriptor logic)
	const createI18nWrapper = (original) => {
		const descriptors = Object.getOwnPropertyDescriptors(original);
		if (descriptors.__original) delete descriptors.__original;
		const wrapper = Object.create(Object.getPrototypeOf(original), descriptors);

		if (!Object.prototype.hasOwnProperty.call(wrapper, '__original')) {
			try {
				Object.defineProperty(wrapper, '__original', {
					value: original,
					writable: false,
					enumerable: false,
					configurable: false,
				});
			} catch (_) {
				/* ignore */
			}
		}

		return wrapper;
	};

	const ret = useMemo(
		() => {
			const original = finalI18n;
			const lang = original?.language;

			let i18nWrapper = original;

			if (original) {
				// if we already created a wrapper for this original instance
				if (wrapperRef.current && wrapperRef.current.__original === original) {
					// language changed -> create fresh wrapper so identity changes
					if (wrapperLangRef.current !== lang) {
						i18nWrapper = createI18nWrapper(original);

						wrapperRef.current = i18nWrapper;
						wrapperLangRef.current = lang;
					} else {
						// reuse existing wrapper when language didn't change
						i18nWrapper = wrapperRef.current;
					}
				} else {
					// first time for this original instance -> create wrapper
					i18nWrapper = createI18nWrapper(original);

					wrapperRef.current = i18nWrapper;
					wrapperLangRef.current = lang;
				}
			}

			const effectiveT =
				!ready && !useSuspense
					? (...args) => {
							warnOnce(
								i18n,
								'USE_T_BEFORE_READY',
								'useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t.',
							);
							return t(...args);
						}
					: t;

			const arr = [effectiveT, i18nWrapper, ready];
			arr.t = effectiveT;
			arr.i18n = i18nWrapper;
			arr.ready = ready;
			return arr;
		},
		[t, finalI18n, ready, finalI18n.resolvedLanguage, finalI18n.language, finalI18n.languages],
		subSlot(slot, 'ut:result'),
	);

	if (i18n && useSuspense && !ready) {
		use(getSuspenseLoadPromise(i18n, props.lng, namespaces));
	}

	return ret;
};
