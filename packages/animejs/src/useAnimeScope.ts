import { createScope, type Scope } from 'animejs';
import { useEffect, useRef, useState } from 'octane';
import { splitSlot, subSlot } from './internal';

export interface UseAnimeScopeResult<
	RootElement extends HTMLElement | SVGElement = HTMLDivElement,
> {
	readonly root: { current: RootElement | null };
	readonly scope: { current: Scope | null };
}

export type AnimeScopeSetup = (scope: Scope) => void | (() => void);

export function useAnimeScope<RootElement extends HTMLElement | SVGElement = HTMLDivElement>(
	...runtime: [setup: AnimeScopeSetup, dependencies?: readonly unknown[], slot?: symbol]
): UseAnimeScopeResult<RootElement> {
	const [args, slot] = splitSlot(runtime);
	const [setup, dependencies = []] = args as [AnimeScopeSetup, dependencies?: readonly unknown[]];
	const root = useRef<RootElement | null>(null, subSlot(slot, 'root'));
	const scope = useRef<Scope | null>(null, subSlot(slot, 'scope'));
	const [result] = useState<UseAnimeScopeResult<RootElement>>(
		() => ({ root, scope }),
		subSlot(slot, 'result'),
	);

	useEffect(
		() => {
			if (!root.current) return;

			const nextScope = createScope({ root });
			scope.current = nextScope;
			let setupError: unknown;
			nextScope.add((activeScope) => {
				try {
					return setup(activeScope ?? nextScope);
				} catch (error) {
					setupError = error;
				}
			});
			if (setupError !== undefined) {
				scope.current = null;
				nextScope.revert();
				throw setupError;
			}

			return () => {
				if (scope.current === nextScope) scope.current = null;
				nextScope.revert();
			};
		},
		dependencies as unknown[],
		subSlot(slot, 'effect'),
	);

	return result;
}
