import { atom, useAtomValue } from '@octanejs/jotai';

// Differential fixture: an async atom behind a suspense boundary. The promise
// is module-level and resolved DETERMINISTICALLY by a click (each side has its
// own module instance, so each resolves its own promise) — fallback and
// resolved HTML must both be byte-identical with real jotai on React.
let resolveValue: (v: number) => void;
const pending = new Promise<number>((r) => {
	resolveValue = r;
});
const asyncAtom = atom(pending);

function Reader() @{
	const v = useAtomValue(asyncAtom);
	<span id="value">{'v=' + v}</span>
}

export function AsyncApp() @{
	<div>
		@try {
			<Reader />
		} @pending {
			<span id="fallback">loading</span>
		}
		<button id="resolve" onClick={() => resolveValue(7)}>resolve</button>
	</div>
}
