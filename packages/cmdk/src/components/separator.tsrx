// Command.Separator. Shown when the search is empty (or always, with
// `alwaysRender`); removed while searching.
import { useRef } from 'octane';
import { useCmdk } from '../hooks.tsrx';
import type { SeparatorProps } from '../types';

export function Separator(props: SeparatorProps) @{
	const { alwaysRender, ref: _ref, ...etc } = props;
	const ref = useRef<HTMLDivElement | null>(null);
	const render = useCmdk((s) => !s.search);

	if (!alwaysRender && !render) return null;
	<div ref={[ref, props.ref]} {...etc} cmdk-separator="" role="separator" />
}
