import { use, useMemo } from 'octane';

// Fixtures for conformance/use-replay-extra.test.ts — ports from
// facebook/react ReactUse-test.js (React 19.2.7).

// Per ReactUse-test.js:875 — a useMemo ABOVE the suspending use() must be
// reused (not recomputed) when the body replays, and a useMemo BELOW it runs
// exactly once, after the value resolves.
export function ExcitingText(props) @{
	<>
		@try {
			const uppercaseText = useMemo(() => {
				props.log('Compute uppercase: ' + props.text);
				return props.text.toUpperCase();
			}, [props.text]);
			const exclamatoryText = use(props.getText(uppercaseText + '!'));
			const sparklingText = useMemo(() => {
				props.log('Add sparkles: ' + exclamatoryText);
				return '* ' + exclamatoryText + ' *';
			}, [exclamatoryText]);
			<span id="out">
				{sparklingText as string}
			</span>
		} @pending {
			<span id="fallback">{'loading'}</span>
		}
	</>
}

// Per ReactUse-test.js:765 — a thenable whose then() calls resolve
// SYNCHRONOUSLY. React unwraps it without suspending; the thenable is passed
// in via props (stable identity) so a replaying runtime converges instead of
// re-creating it per attempt.
export function SyncThenableBoundary(props) @{
	<>
		@try {
			const v = use(props.thenable);
			<span id="out">
				{v as string}
			</span>
		} @pending {
			<span id="fallback">{'loading'}</span>
		}
	</>
}
