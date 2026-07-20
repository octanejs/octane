// Command.List. The listbox container; wires the inner sizer to the command
// context so the root can query items within it.
import { useRef } from 'octane';
import { useCommand } from '../context.tsrx';
import { useCmdk } from '../hooks.tsrx';
import type { ListProps } from '../types';

export function List(props: ListProps) @{
	const { children, label = 'Suggestions', ref: _ref, ...etc } = props;
	const ref = useRef<HTMLDivElement | null>(null);
	const selectedItemId = useCmdk((s) => s.selectedItemId);
	const context = useCommand()!;

	// The ResizeObserver that drives --cmdk-list-height lands in a later phase.

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
		<div ref={context.listInnerRef} cmdk-list-sizer="">{children}</div>
	</div>
}
