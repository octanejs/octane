// Regression fixture: sibling text holes interleaved with component holes — the `.meta`-row
// shape from the hacker-news StoryRow. `htextSwap` mounts a sibling text hole by REPLACING its
// `<!>` placeholder with a text node (detaching the placeholder), so every element walk based
// on that placeholder — the NEXT text hole (`sibling(_el, 2)`) AND the following component
// anchors (`sibling(_el, 1)`) — must be computed BEFORE the htextSwap runs. Otherwise
// `sibling(<detached>, n)` returns null and `htextSwap(null)` throws
// "Cannot read properties of null (reading 'parentNode')".

function Tag(props) @{
	<b class="tag">{props.label as string}</b>
}

export function Interleaved(props) @{
	<div class="meta">
		{props.a as string}
		<Tag label="X" />
		{props.b as string}
		<Tag label="Y" />
	</div>
}
