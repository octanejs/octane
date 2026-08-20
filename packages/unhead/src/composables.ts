import type {
	ActiveHeadEntry,
	HeadEntryOptions,
	HeadSafe,
	Unhead,
	UseHeadInput,
	UseScriptInput,
	UseScriptOptions,
	UseScriptReturn,
	UseSeoMetaInput,
} from 'unhead/types';
import { useContext, useEffect, useRef } from 'octane';
import {
	useHead as baseHead,
	useHeadSafe as baseHeadSafe,
	useSeoMeta as baseSeoMeta,
	useScript as baseUseScript,
} from 'unhead';
import { UnheadContext } from './context';
import { splitSlot, subSlot } from './internal';

interface ScriptCallbackRecord {
	active: boolean;
	handler: (...args: any[]) => any;
	key: 'loaded' | 'error';
	registered: boolean;
	renderScoped: boolean;
	renderId: number;
	script: UseScriptReturn<any>;
}

export function useUnhead(slot?: symbol): Unhead;
export function useUnhead(...rest: [slot?: symbol]): Unhead {
	splitSlot(rest);
	const instance = useContext(UnheadContext);
	if (!instance) {
		throw new Error('useHead() was called without provide context.');
	}
	return instance;
}

function withSideEffects<T extends ActiveHeadEntry<any>>(
	input: unknown,
	options: HeadEntryOptions & { head?: Unhead },
	fn: (head: Unhead, input: any, options: HeadEntryOptions) => T,
	slot: symbol | undefined,
): T {
	const head = options.head || useUnhead(subSlot(slot, 'unhead'));
	const entryRef = useRef<T | null>(null, subSlot(slot, 'entry'));
	const inputRef = useRef(input, subSlot(slot, 'input'));
	inputRef.current = input;

	if (head.ssr && !entryRef.current) {
		entryRef.current = fn(head, input, options);
	}

	useEffect(
		function createEntry() {
			const entry = fn(head, inputRef.current, options);
			entryRef.current = entry;
			return function disposeEntry() {
				entry.dispose();
				entryRef.current = null;
			};
		},
		[head],
		subSlot(slot, 'mount'),
	);

	useEffect(
		function patchEntry() {
			entryRef.current?.patch(input);
		},
		[input],
		subSlot(slot, 'patch'),
	);

	if (head.ssr) {
		return entryRef.current as T;
	}

	const proxyRef = useRef<T | null>(null, subSlot(slot, 'proxy'));
	if (!proxyRef.current) {
		proxyRef.current = {
			patch: function patch(newInput: unknown) {
				entryRef.current?.patch(newInput);
			},
			dispose: function dispose() {
				entryRef.current?.dispose();
				entryRef.current = null;
			},
			_poll: function poll(rm?: boolean) {
				(entryRef.current as { _poll?: (rm?: boolean) => void } | null)?._poll?.(rm);
			},
		} as unknown as T;
	}
	return proxyRef.current;
}

export function useHead(
	input?: UseHeadInput,
	options?: HeadEntryOptions,
): ActiveHeadEntry<UseHeadInput>;
export function useHead(
	...rest: [input?: UseHeadInput, options?: HeadEntryOptions, slot?: symbol]
): ActiveHeadEntry<UseHeadInput> {
	const [user, slot] = splitSlot(rest);
	const input = (user[0] ?? {}) as UseHeadInput;
	const options = (user[1] ?? {}) as HeadEntryOptions;
	return withSideEffects(input, options, baseHead, slot);
}

export function useHeadSafe(
	input?: HeadSafe,
	options?: HeadEntryOptions,
): ActiveHeadEntry<HeadSafe>;
export function useHeadSafe(
	...rest: [input?: HeadSafe, options?: HeadEntryOptions, slot?: symbol]
): ActiveHeadEntry<HeadSafe> {
	const [user, slot] = splitSlot(rest);
	const input = (user[0] ?? {}) as HeadSafe;
	const options = (user[1] ?? {}) as HeadEntryOptions;
	return withSideEffects(input, options, baseHeadSafe, slot);
}

export function useSeoMeta(
	input?: UseSeoMetaInput,
	options?: HeadEntryOptions,
): ActiveHeadEntry<UseSeoMetaInput>;
export function useSeoMeta(
	...rest: [input?: UseSeoMetaInput, options?: HeadEntryOptions, slot?: symbol]
): ActiveHeadEntry<UseSeoMetaInput> {
	const [user, slot] = splitSlot(rest);
	const input = (user[0] ?? {}) as UseSeoMetaInput;
	const options = (user[1] ?? {}) as HeadEntryOptions;
	return withSideEffects(input, options, baseSeoMeta, slot);
}

export function useScript<T extends Record<symbol | string, any> = Record<symbol | string, any>>(
	input: UseScriptInput,
	options?: Omit<UseScriptOptions<T>, 'scope'>,
): UseScriptReturn<T>;
export function useScript<T extends Record<symbol | string, any> = Record<symbol | string, any>>(
	...rest: [input: UseScriptInput, options?: Omit<UseScriptOptions<T>, 'scope'>, slot?: symbol]
): UseScriptReturn<T> {
	const [user, slot] = splitSlot(rest);
	const rawInput = user[0] as UseScriptInput;
	const input = (typeof rawInput === 'string' ? { src: rawInput } : rawInput) as UseScriptInput;
	const options = (user[1] || {}) as UseScriptOptions<T>;
	const head = options.head || useUnhead(subSlot(slot, 'unhead'));
	const trigger = options.trigger;
	const resolvedOptions = {
		...options,
		head,
		trigger: head.ssr && trigger === 'server' ? 'server' : 'manual',
	} as UseScriptOptions<T>;

	const callbackRecords = useRef<ScriptCallbackRecord[]>([], subSlot(slot, 'callbacks'));
	const isMounted = useRef(false, subSlot(slot, 'mounted'));
	const renderId = useRef(0, subSlot(slot, 'render-id'));
	const committedRenderId = useRef(0, subSlot(slot, 'committed-id'));
	const currentRenderId = ++renderId.current;

	const script = baseUseScript(head, input, resolvedOptions);

	function reconcileScriptCallbacks(activeRenderId: number) {
		callbackRecords.current.forEach(function markStale(record) {
			if (record.renderScoped && record.renderId !== activeRenderId) {
				record.active = false;
				unregisterScriptCallback(record);
			}
		});
		callbackRecords.current = callbackRecords.current.filter(function keepActive(record) {
			return record.active && (!record.renderScoped || record.renderId === activeRenderId);
		});
	}

	function registerScriptCallback(record: ScriptCallbackRecord) {
		if (!record.active || record.registered) return;
		const cbs = record.script._cbs[record.key];
		if (!cbs) {
			record.handler(record.script.instance);
			return;
		}
		cbs.push(record.handler);
		record.registered = true;
	}

	function unregisterScriptCallback(record: ScriptCallbackRecord) {
		if (!record.registered) return;
		const idx = record.script._cbs[record.key]?.indexOf(record.handler) ?? -1;
		if (idx !== -1) record.script._cbs[record.key]?.splice(idx, 1);
		record.registered = false;
	}

	useEffect(
		function commitScript() {
			isMounted.current = true;
			committedRenderId.current = currentRenderId;
			reconcileScriptCallbacks(currentRenderId);
			callbackRecords.current.forEach(registerScriptCallback);
			return function releaseScript() {
				isMounted.current = false;
				callbackRecords.current.forEach(unregisterScriptCallback);
			};
		},
		null,
		subSlot(slot, 'commit'),
	);

	useEffect(
		function setupTrigger() {
			return script.setupTriggerHandler(trigger);
		},
		[script, trigger],
		subSlot(slot, 'trigger'),
	);

	function registerCb(key: 'loaded' | 'error', cb: (...args: any[]) => any) {
		const renderScoped = !(isMounted.current && committedRenderId.current === currentRenderId);
		const record: ScriptCallbackRecord = {
			active: true,
			handler: function invoke(...args: unknown[]) {
				if (!record.active) return;
				record.active = false;
				record.registered = false;
				return cb(...args);
			},
			key,
			registered: false,
			renderScoped,
			renderId: currentRenderId,
			script,
		};
		callbackRecords.current.push(record);
		if (isMounted.current && committedRenderId.current === currentRenderId) {
			registerScriptCallback(record);
		}

		function destroy() {
			if (!record.active) return;
			record.active = false;
			unregisterScriptCallback(record);
			const idx = callbackRecords.current.indexOf(record);
			if (idx !== -1) callbackRecords.current.splice(idx, 1);
		}

		return destroy;
	}

	script.onLoaded = function onLoaded(cb: (instance: T) => void | Promise<void>) {
		return registerCb('loaded', cb);
	};
	script.onError = function onError(cb: (err?: Error) => void | Promise<void>) {
		return registerCb('error', cb);
	};
	return script;
}
