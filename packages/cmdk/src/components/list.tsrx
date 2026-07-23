// Command.List. The listbox container; wires the inner sizer to the command
// context so the root can query items within it, and keeps the
// `--cmdk-list-height` custom property in sync with the sizer's height.
import { useEffect, useRef } from 'octane';
import { useCommand } from '../context.tsrx';
import { useCmdk } from '../hooks.tsrx';
import type { ListProps } from '../types';

export function List(props: ListProps) @{
	const { children, label = 'Suggestions', ref: _ref, ...etc } = props;
	const ref = useRef<HTMLDivElement | null>(null);
	const height = useRef<HTMLDivElement | null>(null);
	const selectedItemId = useCmdk((s) => s.selectedItemId);
	const context = useCommand()!;

	// Mirror the sizer's height onto `--cmdk-list-height` so consumers can
	// animate the list as results change. Guarded on ResizeObserver: it does not
	// exist during SSR or in jsdom, where the property is simply never set.
	useEffect(() => {
		const el = height.current;
		const wrapper = ref.current;
		if (!el || !wrapper || typeof ResizeObserver === 'undefined') return;

		let animationFrame = 0;
		const observer = new ResizeObserver(() => {
			animationFrame = requestAnimationFrame(() => {
				wrapper.style.setProperty('--cmdk-list-height', el.offsetHeight.toFixed(1) + 'px');
			});
		});
		observer.observe(el);

		return () => {
			cancelAnimationFrame(animationFrame);
			observer.unobserve(el);
		};
	}, []);

	<div
		ref={[ref, props.ref]}
		{...etc}
		cmdk-list=""
		role="listbox"
		tabIndex={-1}
		aria-activedescendant={selectedItemId}
		aria-label={label}
		id={context.listId}
	>
		<div ref={[height, context.listInnerRef]} cmdk-list-sizer="">{children}</div>
	</div>
}
