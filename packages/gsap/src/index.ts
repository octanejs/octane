import gsap from 'gsap';
import { useEffect, useLayoutEffect, useRef } from 'octane';
import { splitSlot, subSlot } from './internal.ts';

type AnyFunction = (...args: any[]) => any;
export type ContextSafeFunction = <T extends AnyFunction>(func: T) => T;
export type ContextFunction = (
	context: gsap.Context,
	contextSafe: ContextSafeFunction,
) => AnyFunction | unknown | void;

interface RefLike<T> {
	current: T | null;
}

export interface UseGSAPConfig {
	scope?: RefLike<Element> | Element | string;
	dependencies?: unknown[];
	revertOnUpdate?: boolean;
}

export interface UseGSAPReturn {
	context: gsap.Context;
	contextSafe: ContextSafeFunction;
}

interface UseGSAP {
	(callback?: ContextFunction, dependencies?: unknown[]): UseGSAPReturn;
	(callback?: ContextFunction, config?: UseGSAPConfig): UseGSAPReturn;
	(config?: UseGSAPConfig): UseGSAPReturn;
	register(core: typeof gsap): void;
	headless: true;
}

const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;
const emptyDependencies: unknown[] = [];
const defaultConfig: UseGSAPConfig = {};
let activeGSAP = gsap;

function isConfig(value: unknown): value is UseGSAPConfig {
	return value !== null && !Array.isArray(value) && typeof value === 'object';
}

const useGSAPImpl = (...rawArgs: unknown[]): UseGSAPReturn => {
	const [args, slot] = splitSlot(rawArgs);
	let callback = args[0] as ContextFunction | UseGSAPConfig | undefined;
	let dependencies: unknown[] | UseGSAPConfig | null | undefined = (
		args[1] === undefined ? emptyDependencies : args[1]
	) as unknown[] | UseGSAPConfig | null;
	let config = defaultConfig;

	if (isConfig(callback)) {
		config = callback;
		callback = undefined;
		dependencies = 'dependencies' in config ? config.dependencies : emptyDependencies;
	} else if (isConfig(dependencies)) {
		config = dependencies;
		dependencies = 'dependencies' in config ? config.dependencies : emptyDependencies;
	}

	if (callback !== undefined && typeof callback !== 'function') {
		console.warn('First parameter must be a function or config object');
	}

	const { scope, revertOnUpdate } = config;
	const mounted = useRef(false, subSlot(slot, 'mounted'));
	const context = useRef(
		activeGSAP.context(() => {}, scope),
		subSlot(slot, 'context'),
	);
	const contextSafe = useRef<ContextSafeFunction>(
		(func) =>
			(context.current.add as unknown as (name: null, callback: AnyFunction) => AnyFunction)(
				null,
				func,
			) as typeof func,
		subSlot(slot, 'context-safe'),
	);
	const resolvedDependencies = dependencies as unknown[] | null | undefined;
	const deferCleanup =
		resolvedDependencies != null && resolvedDependencies.length > 0 && revertOnUpdate !== true;

	useIsomorphicLayoutEffect(
		() => {
			mounted.current = true;
			return () => context.current.revert();
		},
		emptyDependencies,
		subSlot(slot, 'mount-cleanup'),
	);

	useIsomorphicLayoutEffect(
		() => {
			if (typeof callback === 'function') context.current.add(callback, scope);
			if (!deferCleanup || !mounted.current) {
				return () => context.current.revert();
			}
		},
		resolvedDependencies,
		subSlot(slot, 'callback'),
	);

	return {
		context: context.current,
		contextSafe: contextSafe.current,
	};
};

export const useGSAP = useGSAPImpl as UseGSAP;

useGSAP.register = (core) => {
	activeGSAP = core;
};
useGSAP.headless = true;
