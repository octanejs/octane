// A styled-components-shaped scenario: a plain component renders
// `createElement(props.tag, …)` (value-position host descriptor →
// hostElementBody) and forwards its compiled children-block children. A
// state-driven tag change must remount those children into the fresh element.
import { createElement, useState } from 'octane';

function Shell(props) {
	return createElement(props.tag, { id: 'shell', children: props.children });
}

export function TagSwapChildren() @{
	const [tag, setTag] = useState('button');
	<div>
		<Shell tag={tag}>
			Content
			<b id="bold">bold</b>
		</Shell>
		<button id="swap" onClick={() => setTag('a')}>
			swap
		</button>
	</div>
}
