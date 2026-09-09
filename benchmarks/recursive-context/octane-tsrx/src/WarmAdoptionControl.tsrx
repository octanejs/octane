import { useOrdinaryMemo } from './warm-adoption-memo.js';

type Props = { depth: number; version: number };

export default function WarmAdoptionControl(props: Props) @{
	const value = useOrdinaryMemo(props.version, props.depth);
	<div>
		<span class="memo-value" data-depth={props.depth}>{value as string}</span>
		@if (props.depth > 0) {
			<WarmAdoptionControl depth={props.depth - 1} version={props.version} />
		}
	</div>
}
