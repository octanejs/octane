import { useLayoutEffect, useRef, useState } from 'octane';

type StateUpdate<P, S> =
	Partial<S> | S | ((state: Readonly<S>, props: Readonly<P>) => Partial<S> | S);

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

function assignRef<T>(ref: unknown, value: T | null): void {
	if (typeof ref === 'function') ref(value);
	else if (ref && typeof ref === 'object' && 'current' in ref) (ref as {
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
		const output = controller.render();

		useLayoutEffect(() => {
			assignRef(ref, controller);
			if (previous === null) controller.componentDidMount?.();
			else controller.componentDidUpdate?.(previous.props, previous.state);
			committedRef.current = { props: controller.props, state: controller.state };
			return () => assignRef(ref, null);
		}, [controller, previous, ref]);

		useLayoutEffect(
			() => () => {
				controller.componentWillUnmount?.();
			},
			[controller],
		);

		return output;
	}

	LegacyComponent.displayName = Controller.displayName ?? Controller.name;
	LegacyComponent.defaultProps = Controller.defaultProps;
	return LegacyComponent;
}
