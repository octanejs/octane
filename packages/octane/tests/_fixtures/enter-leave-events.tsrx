import { useState } from 'octane';

// Enter/leave family (pointerenter/pointerleave/mouseenter/mouseleave): the browser
// dispatches ONE non-bubbling event PER entered/left element, so a handler must fire
// only for its own element's event — never for a descendant's (unlike focus/blur,
// where octane reproduces React's bubbling onFocus/onBlur by walking up).
export function EnterLeaveEvents() @{
	const [log, setLog] = useState('');
	<div class="wrap" onPointerEnter={() => setLog((l) => l + 'W')}>
		<button
			class="btn"
			onPointerEnter={() => setLog((l) => l + 'e')}
			onPointerLeave={() => setLog((l) => l + 'l')}
			onMouseEnter={() => setLog((l) => l + 'm')}
		>{'hover me'}</button>
		<span class="log">{log}</span>
	</div>
}
