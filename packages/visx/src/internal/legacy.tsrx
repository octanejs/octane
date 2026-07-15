import { useLayoutEffect, useRef, useState } from 'octane';

type StateUpdate<P, S> =
	Partial<S> | S | ((state: Readonly<S>, props: Readonly<P>) => Partial<S> | S);

const forceUpdateControllers = new WeakSet<object>();

function shallowEqual(previous: unknown, next: unknown): boolean {
	if (Object.is(previous, next)) return true;
	if (
		typeof previous !== 'object' ||
		previous === null ||
		typeof next !== 'object' ||
		next === null
	) {
		return false;
	}
	const previousKeys = Object.keys(previous);
	const nextKeys = Object.keys(next);
	if (previousKeys.length !== nextKeys.length) return false;
	return previousKeys.every(
		(key) =>
			Object.prototype.hasOwnProperty.call(next, key) &&
			Object.is(
				(previous as Record<string, unknown>)[key],
				(next as Record<string, unknown>)[key],
			),
	);
}

/**
 * Small lifecycle adapter for the nine class implementations retained by Visx
 * upstream. Classes are controller objects only; Octane always renders the
 * functional wrapper returned by legacyComponent.
 */
export class Component<P = Record<string, never>, S = any> {
	props: Readonly<P>;
	state: Readonly<S>;
	__applyUpdate?: (update: StateUpdate<P, S>, callback?: () => void) => void;

	constructor(props: P) {
		this.props = props;
	}

	setState(update: StateUpdate<P, S>, callback?: () => void): void {
		this.__applyUpdate?.(update, callback);
	}

	forceUpdate(callback?: () => void): void {
		forceUpdateControllers.add(this);
		this.__applyUpdate?.((state) => state, callback);
	}
}

export class PureComponent<P = Record<string, never>, S = any> extends Component {}

export function createRef<T>(): { current: T | null } {
	return { current: null };
}

type LegacyController = Component<any, any> & {
		render: () => unknown;
		componentDidMount?: () => void;
		componentDidUpdate?: (previousProps: Readonly<any>, previousState: Readonly<any>) => void;
		componentWillUnmount?: () => void;
	};

type LegacyConstructor = {
	new (props: any): LegacyController;
	defaultProps?: Record<string, unknown>;
	displayName?: string;
	name?: string;
};

function assignRef<T>(ref: unknown, value: T | null): (() => void) | undefined {
	if (typeof ref === 'function') {
		const cleanup = ref(value);
		return typeof cleanup === 'function' ? cleanup : undefined;
	} else if (ref && typeof ref === 'object' && 'current' in ref) (ref as {
		current: T | null;
	}).current = value;
}

export function legacyComponent<C extends LegacyConstructor>(Controller: C): ((props: ConstructorParameters<C>[0] & {
	ref?: unknown
}) => any) & {
	displayName?: string;
	defaultProps: C['defaultProps'];
} {
	function LegacyComponent(inputProps: ConstructorParameters<C>[0] & { ref?: unknown }): unknown {
		const [, forceRender] = useState(0);
		const controllerRef = useRef<InstanceType<C> | null>(null);
		const committedRef = useRef<{ props: Readonly<any>; state: Readonly<any> } | null>(null);
		const outputRef = useRef<unknown>(null);

		const { ref, ...rawProps } = inputProps ?? {} as Record<string, unknown> & { ref?: unknown };
		const props = { ...(Controller.defaultProps ?? {}), ...rawProps };
		let controller = controllerRef.current;
		if (controller === null) {
			controller = new Controller(props) as InstanceType<C>;
			controllerRef.current = controller;
			controller.__applyUpdate = (update, callback) => {
				const next =
					typeof update === 'function'
						? (update as (state: unknown, props: unknown) => unknown)(
								controller!.state,
								controller!.props,
							)
						: update;
				if (next != null) controller!.state = { ...controller!.state as object, ...next as object };
				forceRender((value) => value + 1);
				callback?.();
			};
		}

		const previous = committedRef.current;
		controller.props = props;
		const forceUpdateRequested = forceUpdateControllers.delete(controller);
		const shouldRender =
			previous === null ||
			forceUpdateRequested ||
			!(controller instanceof PureComponent) ||
			!shallowEqual(previous.props, props) ||
			!shallowEqual(previous.state, controller.state);
		const rendered = { props: controller.props, state: controller.state };
		if (shouldRender) outputRef.current = controller.render();

		useLayoutEffect(() => {
			const cleanup = assignRef(ref, controller);
			return () => {
				if (cleanup) cleanup();
				else assignRef(ref, null);
			};
		}, [controller, ref]);

		useLayoutEffect(() => {
			if (shouldRender) {
				if (previous === null) controller.componentDidMount?.();
				else controller.componentDidUpdate?.(previous.props, previous.state);
			}
			committedRef.current = rendered;
		}, null);

		useLayoutEffect(
			() => () => {
				controller.componentWillUnmount?.();
			},
			[controller],
		);

		return outputRef.current;
	}

	LegacyComponent.displayName = Controller.displayName ?? Controller.name;
	LegacyComponent.defaultProps = Controller.defaultProps;
	return LegacyComponent;
}
