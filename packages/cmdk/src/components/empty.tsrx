// Command.Empty. Renders only when the filter matched nothing.
import { useCmdk } from '../hooks.tsrx';
import type { EmptyProps } from '../types';

export function Empty(props: EmptyProps) @{
	const render = useCmdk((s) => s.filtered.count === 0);

	if (!render) return null;

	const { ref: _ref, children, ...etc } = props;
	<div ref={props.ref} {...etc} cmdk-empty="" role="presentation">{children}</div>
}
