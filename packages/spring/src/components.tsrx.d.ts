import type { SpringContextValue } from './context';
import type { UseTransitionProps } from './hooks';
import type { SpringValues } from './types/objects';
import type { ControllerUpdate, Lookup } from './types/index';

export type TrailProps<Item = any, State extends Lookup = Lookup> = ControllerUpdate<State> & {
	items?: Item[];
	children?:
		((item: Item, index: number) => (styles: SpringValues<State> | undefined) => unknown) | unknown;
};

export type TransitionProps<Item = any, State extends Lookup = Lookup> = UseTransitionProps<
	Item,
	State
> & {
	items?: Item | Item[];
	children?: ((item: Item, index: number) => (styles: SpringValues<State>) => unknown) | unknown;
};

export declare function SpringContext(
	props: SpringContextValue & { children?: unknown },
	scope?: unknown,
): void;

/** Implementation export; public typed overloads live in `spring-component.ts`. */
export declare function Spring(props: Record<string, unknown> & { children?: unknown }): unknown;

export declare function Trail<Item, State extends Lookup = Lookup>(
	props: TrailProps<Item, State>,
): void;
export declare function Transition<Item, State extends Lookup = Lookup>(
	props: TransitionProps<Item, State>,
): void;
