import { createElement, memo } from 'octane';
import { observer } from '@octanejs/mobx';

export function RetainedTreeBody(props: { label: string; capture: (tree: object) => void }) @{
	const tree = createElement('div', { 'data-label': props.label });
	props.capture(tree);
	<>
		{tree}
	</>
}

export const RetainedTree = observer(RetainedTreeBody);
export const MemoRetainedTree = memo(RetainedTreeBody);
