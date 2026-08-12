import { createElement, useLayoutEffect, useRef, useState, type ElementDescriptor } from 'octane';
import TransitionGroupContext from './TransitionGroupContext.ts';
import type { TransitionGroupProps } from './types.ts';
import {
	getChildMapping,
	getInitialChildMapping,
	getNextChildMapping,
	type ChildMapping,
} from './utils/ChildMapping.ts';

export function TransitionGroup(props: TransitionGroupProps) @{
	const mounted = useRef(false);
	const first = useRef(true);
	const mapping = useRef<ChildMapping>({});
	const children = useRef(props.children);
	const [isMounting, setIsMounting] = useState(true);
	const [, rerender] = useState(0);

	// Match upstream TransitionGroup.handleExited: read live children, forward
	// onExited, then delete only if the key was not synchronously re-added.
	// A sync re-add re-renders and rebuilds mapping; deleting afterward would
	// drop that survivor and force a second enter on the next pass.
	const handleExited = function handleExited(child: ElementDescriptor, node?: Element) {
		if (String(child.key) in getChildMapping(children.current)) return;
		(child.props.onExited as ((node?: Element) => void) | undefined)?.(node);
		if (String(child.key) in getChildMapping(children.current)) return;
		if (mounted.current) {
			delete mapping.current[String(child.key)];
			rerender(function bump(value: number) {
				return value + 1;
			});
		}
	};

	if (first.current) {
		mapping.current = getInitialChildMapping(props, handleExited);
		children.current = props.children;
		first.current = false;
	} else {
		mapping.current = getNextChildMapping(props, mapping.current, handleExited);
		children.current = props.children;
	}

	useLayoutEffect(() => {
		mounted.current = true;
		setIsMounting(false);
		return () => {
			mounted.current = false;
		};
	}, []);

	const {
		children: _children,
		component = 'div',
		childFactory = (child: ElementDescriptor) => child,
		appear: _appear,
		enter: _enter,
		exit: _exit,
		...wrapperProps
	} = props;
	const renderedChildren = Object.values(mapping.current).map(childFactory);
	const output =
		component === null
			? renderedChildren
			: createElement(component, wrapperProps, ...renderedChildren);

	<TransitionGroupContext.Provider value={{ isMounting }}>{output}</TransitionGroupContext.Provider>
}

export default TransitionGroup;
