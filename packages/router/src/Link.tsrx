// A navigating anchor. Builds the href from the router, intercepts a plain
// left-click to `router.navigate` (letting modified clicks / non-_self targets fall
// through to the browser), and reflects active state as `data-status="active"` +
// `aria-current="page"`. Ref is a prop (octane's model — no forwardRef). v1 skips
// intent-preloading.
import { useRouterState } from './useRouterState.ts';
import { useRouter } from './context.ts';

function callProp(value, event) {
	if (typeof value === 'function') value(event);
}

function resolvePropBag(value) {
	return typeof value === 'function' ? value() : value ?? {};
}

export function Link(props) @{
	const router = useRouter();
	const location = useRouterState({ select: (s) => s.location });
	const next = router.buildLocation({
		to: props.to,
		params: props.params,
		search: props.search,
		hash: props.hash,
	});
	const activeOptions = props.activeOptions ?? {};
	const pathnameActive =
		activeOptions.exact === false
			? location.pathname.startsWith(next.pathname)
			: location.pathname === next.pathname;
	const searchActive =
		activeOptions.includeSearch === false || location.searchStr === next.searchStr;
	const hashActive = activeOptions.includeHash === false || location.hash === next.hash;
	const isActive = pathnameActive && searchActive && hashActive;
	const activeBag = resolvePropBag(isActive ? props.activeProps : props.inactiveProps);

	// Forward every prop that isn't one of ours onto the <a> (React-router parity):
	// data-*, aria-*, title, id, role, style, onMouseEnter, etc. The routing props
	// drive href + active state and are consumed here, so they're stripped out of the
	// pass-through.
	const {
		to: _to,
		params: _params,
		search: _search,
		hash: _hash,
		replace: _replace,
		target: _target,
		ref: _ref,
		class: _class,
		className: _className,
		children: _children,
		onClick: _onClick,
		activeProps: _activeProps,
		inactiveProps: _inactiveProps,
		activeOptions: _activeOptions,
		disabled: _disabled,
		reloadDocument: _reloadDocument,
		...rest
	} = props;

	const onClick = (e) => {
		callProp(activeBag.onClick, e);
		callProp(props.onClick, e);
		if (
			e.defaultPrevented || props.disabled || props.reloadDocument || e.button !== 0 || e.metaKey ||
				e.ctrlKey ||
				e.shiftKey ||
				e.altKey ||
				props.target && props.target !== '_self'
		) {
			return;
		}
		e.preventDefault();
		router.navigate({
			to: props.to,
			params: props.params,
			search: props.search,
			hash: props.hash,
			replace: props.replace,
		});
	};

	<a
		{...rest}
		{...activeBag}
		href={next.href}
		ref={props.ref}
		onClick={onClick}
		target={props.target}
		aria-disabled={props.disabled ? 'true' : activeBag['aria-disabled']}
		class={[props.class ?? props.className, activeBag.class, activeBag.className]}
		data-status={isActive ? 'active' : undefined}
		aria-current={isActive ? 'page' : undefined}
	>{props.children}</a>
}
