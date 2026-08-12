import { createElement, Fragment, isChildrenBlock } from 'octane';
import {
	SpringContext as SpringContextObject,
	type SpringContextValue,
	useSpringContext,
} from './context';
import { useSpring, useTrail, useTransition } from './hooks';

function itemKey(item: any, index: number): string | number {
	return item?.key ?? item?.id ??
		(typeof item === 'string' || typeof item === 'number' ? item : index);
}

function keyed(value: unknown, key: string | number): unknown {
	return createElement(Fragment, { key }, value);
}

export function SpringContext(props: SpringContextValue & { children?: unknown }) @{
	const { children, ...value } = props;
	const inherited = useSpringContext();
	<SpringContextObject value={{ ...inherited, ...value }}>{children}</SpringContextObject>
}

export function Spring(props: Record<string, unknown> & { children?: unknown }) @{
	const { children, ...update } = props;
	const styles = useSpring(update);
	<>
		{typeof children === 'function' && !isChildrenBlock(children) ? children(styles) : children}
	</>
}

export function Trail(props: any) @{
	const { children, items = [], ...update } = props;
	const styles = useTrail(items.length, update);
	<>
		{typeof children === 'function' && !isChildrenBlock(children)
			? items.map(
					(item: any, index: number) => keyed(
						children(item, index)(styles[index]),
						itemKey(item, index),
					),
				)
			: children}
	</>
}

export function Transition(props: any) @{
	const { children, items = [], ...update } = props;
	const transitions = useTransition(items, update);
	<>
		{typeof children === 'function' && !isChildrenBlock(children)
			? transitions(
					(styles: any, item: any, transition: any, index: number) => keyed(
						children(item, index)(styles),
						transition.key,
					),
				)
			: children}
	</>
}
