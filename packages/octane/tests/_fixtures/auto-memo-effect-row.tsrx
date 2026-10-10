import { useEffect, useRef } from 'octane';
import { effectRowNumber, effectRowRef } from './auto-memo-effect-imports';

export function EffectImportRow(props: { item: { id: string; label: string } }) @{
	const cell = useRef<HTMLSpanElement | null>(null);
	useEffect(() => {}, [props.item.id]);
	<li ref={effectRowRef}>
		<span ref={cell}>{props.item.label + ':' + 1 / effectRowNumber}</span>
	</li>
}
