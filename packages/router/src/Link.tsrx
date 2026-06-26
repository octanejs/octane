// A navigating anchor. Builds the href from the router, intercepts a plain
// left-click to `router.navigate` (letting modified clicks / non-_self targets fall
// through to the browser), and reflects active state as `data-status="active"` +
// `aria-current="page"`. Ref is a prop (octane's model — no forwardRef). v1 skips
// intent-preloading and `activeProps` className merging.
import { useRouterState } from './useRouterState.ts';
import { useRouter } from './context.ts';

export function Link(props) @{
	const router = useRouter();
	const location = useRouterState({ select: (s) => s.location });
	const next = router.buildLocation({
		to: props.to,
		params: props.params,
		search: props.search,
		hash: props.hash,
	});
	const isActive = location.pathname === next.pathname;

	const onClick = (e) => {
		if (
			e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
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
		href={next.href}
		ref={props.ref}
		onClick={onClick}
		target={props.target}
		class={props.class ?? props.className as string}
		data-status={isActive ? 'active' : undefined}
		aria-current={isActive ? 'page' : undefined}
	>{props.children}</a>
}
