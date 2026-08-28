import {
	Children,
	cloneElement,
	createElement,
	Fragment,
	isValidElement,
	useEffect,
	useState,
} from 'octane';
import { TransitionGroup } from '@octanejs/transition-group';
import type { ValueContainerProps } from '../components.tsrx';
import { markInspectableValueChildren } from '../animated-registry.ts';
import { asComponentElement } from './component-element';

type ValueContainerComponent = typeof import('../components.tsrx').ValueContainer;

function flattenKeyedChildren(children: unknown): unknown[] {
	const flattened: unknown[] = [];
	for (const child of Children.toArray(children)) {
		if (isValidElement(child) && child.type === Fragment) {
			for (const innerChild of Children.toArray(child.props.children)) {
				flattened.push(
					isValidElement(innerChild)
						? cloneElement(innerChild, {
								key: JSON.stringify([child.key, innerChild.key]),
							})
						: innerChild,
				);
			}
			continue;
		}
		flattened.push(child);
	}
	return flattened;
}

export function animatedValueContainer(
	WrappedComponent: ValueContainerComponent,
): ValueContainerComponent {
	function AnimatedValueContainer(props: ValueContainerProps) {
		return asComponentElement<ValueContainerComponent>(
			createElement(props.isMulti ? MultiValueContainer : TransitionGroup, {
				component: WrappedComponent,
				...props,
				children: flattenKeyedChildren(props.children),
			}),
		);
	}
	return markInspectableValueChildren(AnimatedValueContainer);
}

interface MultiValueContainerProps extends ValueContainerProps {
	component: ValueContainerComponent;
}

function MultiValueContainer(props: MultiValueContainerProps) @{
	const { component, children, ...containerProps } = props;
	const [displayFlex, setDisplayFlex] = useState(
		props.isMulti && props.selectProps.controlShouldRenderValue && props.hasValue,
	);
	const [removingValue, setRemovingValue] = useState(false);

	useEffect(() => {
		if (props.hasValue && !displayFlex) setDisplayFlex(true);
	}, [props.hasValue, displayFlex]);

	useEffect(() => {
		if (removingValue && !props.hasValue && displayFlex) setDisplayFlex(false);
		setRemovingValue(false);
	}, [removingValue, props.hasValue, displayFlex]);

	const selectComponents = props.selectProps.components as Record<string, unknown>;
	const mappedChildren = Children.toArray(children).map((child) => {
		if (!isValidElement(child) || child.type !== selectComponents.MultiValue) {
			if (isValidElement(child) && child.type === selectComponents.Placeholder && displayFlex) {
				return null;
			}
			return child;
		}
		return cloneElement(child, { onExited: () => setRemovingValue(true) });
	});
	const innerProps = {
		...props.innerProps,
		style: {
			...(props.innerProps?.style ?? {}) as Record<string, unknown>,
			display: props.isMulti && props.hasValue || displayFlex ? 'flex' : 'grid',
		},
	};

	<TransitionGroup
		component={component}
		{...containerProps}
		innerProps={innerProps}
		children={mappedChildren}
	/>
}
