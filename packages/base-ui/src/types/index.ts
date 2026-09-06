import type * as React from 'octane';

export type {
	BaseUIChangeEventDetails,
	BaseUIGenericEventDetails,
} from '../internals/createBaseUIEventDetails';

// Base UI composes style declarations property by property. Its style surface
// stays object-based even though native Octane host elements also accept CSS text.
export type HTMLProps<T = any> = Omit<React.HTMLAttributes<T>, 'style'> & {
	style?: React.CSSProperties | undefined;
	ref?: React.Ref<T> | undefined;
};

/**
 * Shape of the render prop: a function that takes props to be spread on the element and component's state and returns a React element.
 *
 * @template Props Props to be spread on the rendered element.
 * @template State Component's internal state.
 */
export type ComponentRenderFn<Props, State> = (
	props: Props,
	state: State,
) => React.ReactElement<unknown>;

export type BaseUIEvent<E extends Event> = E & {
	preventBaseUIHandler: () => void;
	readonly baseUIHandlerPrevented?: boolean | undefined;
};
