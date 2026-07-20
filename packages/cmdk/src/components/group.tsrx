// Command.Group. Registers itself, renders an optional heading, and hides when
// no member item matches the search.
import { useId, useLayoutEffect, useMemo, useRef } from 'octane';
import { GroupContext, useCommand } from '../context.tsrx';
import { useCmdk, useValue } from '../hooks.tsrx';
import type { GroupProps } from '../types';

export function Group(props: GroupProps) @{
	const { heading, children, forceMount, ref: _ref, ...etc } = props;
	const id = useId();
	const ref = useRef<HTMLDivElement | null>(null);
	const headingRef = useRef<HTMLDivElement | null>(null);
	const headingId = useId();
	const context = useCommand()!;
	const render = useCmdk(
		(s) => forceMount
			? true
			: context.filter() === false
				? true
				: !s.search
					? true
					: s.filtered.groups.has(id),
	);

	useLayoutEffect(() => {
		return context.group(id);
	}, []);

	// Value derives from the `value` prop or the heading's textContent.
	useValue(id, ref, [props.value, headingRef]);

	const contextValue = useMemo(() => ({ id, forceMount }), [forceMount]);

	<div
		ref={[ref, props.ref]}
		{...etc}
		cmdk-group=""
		role="presentation"
		hidden={render ? undefined : true}
	>
		@if (heading) {
			<div ref={headingRef} cmdk-group-heading="" aria-hidden={true} id={headingId}>{heading}</div>
		}
		<div cmdk-group-items="" role="group" aria-labelledby={heading ? headingId : undefined}>
			<GroupContext.Provider value={contextValue}>{children}</GroupContext.Provider>
		</div>
	</div>
}
