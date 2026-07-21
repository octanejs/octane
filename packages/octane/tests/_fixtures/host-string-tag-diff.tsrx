import { useState } from 'octane';

// Differential fixture: JSX tags that resolve to a HOST tag STRING at runtime
// (React renders these natively via createElement(tag); Octane's componentSlot
// must produce byte-identical HTML through the de-opt host path).

export function TagSwitcher() @{
	const [tag, setTag] = useState('h1');
	const [n, setN] = useState(0);
	const Tag = tag;
	<div class="wrap">
		<button id="flip" onClick={() => setTag(tag === 'h1' ? 'h2' : 'h1')}>{'flip'}</button>
		<button id="bump" onClick={() => setN(n + 1)}>{'bump'}</button>
		<Tag id="t" class={'c' + n}>{`n:${n}`}</Tag>
		<span class="after">{'after'}</span>
	</div>
}

export function MemberTag(props) @{
	<div class="wrap">
		<props.parts.title id="t">{props.text as string}</props.parts.title>
	</div>
}
