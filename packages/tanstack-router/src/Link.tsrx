// A navigating anchor — a thin shell over `useLinkProps` (link.ts), which
// carries ALL of react-router Link's behavior: href building (mask-aware),
// external-URL + dangerous-protocol handling, active-state detection,
// preloading (intent/viewport/render), and the navigate click handler with
// replace/resetScroll/hashScrollIntoView/viewTransition/startTransition/
// ignoreBlocker forwarded. Children may be a render prop —
// `{({ isActive, isTransitioning }) => …}` — and `createLink` renders a custom
// component via the internal `_asChild` prop. Ref is a prop (octane's model —
// no forwardRef); `disabled` renders without an href + role="link" (upstream
// drops the anchor's disabled attribute; the aria props carry the state).
import { isChildrenBlock } from 'octane';
import { useLinkProps } from './link.ts';
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core';
import type { LinkComponentProps, OctaneAnchorProps, UseLinkPropsOptions } from './linkTypes.ts';

// Keep the generic implementation signature visible to `.tsrx` consumers so
// route-aware `to`/`params`/`search` inference and native anchor event types are
// available before declaration emit.
export function Link<TRouter extends AnyRouter = RegisteredRouter, TFrom extends string = string, TTo extends | string
| undefined = undefined, TMaskFrom extends string = TFrom, TMaskTo extends string = ''>(props: LinkComponentProps<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo>) @{
	const { _asChild: AsChild, children, ...rest } = props as typeof props & {
			_asChild?: any;
		};
	const linkProps = useLinkProps(
		rest as UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
	) as
		OctaneAnchorProps & {
			disabled?: boolean;
			'data-status'?: string;
			'data-transitioning'?: string;
		};
	const { disabled: _disabled, ...aProps } = linkProps;

	const resolvedChildren =
		typeof children === 'function' && !isChildrenBlock(children)
			? children({
					isActive: linkProps['data-status'] === 'active',
					isTransitioning: linkProps['data-transitioning'] === 'transitioning',
				})
			: children;

	@if (AsChild) {
		<AsChild {...linkProps}>{resolvedChildren}</AsChild>
	} @else {
		<a {...aProps as Record<string, any>}>{resolvedChildren}</a>
	}
}
