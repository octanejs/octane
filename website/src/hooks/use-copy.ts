// Clipboard-copy state for a copy button: writes text and flips `copied` to
// true, reverting after COPY_RESET_MS. A re-copy restarts that window rather
// than letting the previous click's timer clear the new "Copied" early, and the
// unmount cleanup keeps the timer from firing into a torn-down scope. Callers
// own their own markup — this is just the shared behavior (and the one place the
// timer is managed correctly).
import { useEffect, useRef, useState } from 'octane';
import { COPY_RESET_MS } from '../constants/site.ts';

export function useCopyToClipboard(): { copied: boolean; copy: (text: string) => void } {
	const [copied, setCopied] = useState(false);
	const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(resetTimer.current), []);

	const copy = (text: string) => {
		if (!text) return;
		navigator.clipboard
			?.writeText(text)
			.then(() => {
				setCopied(true);
				clearTimeout(resetTimer.current);
				resetTimer.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
			})
			.catch(() => {
				// Clipboard permission denied — the button simply stays "Copy".
			});
	};

	return { copied, copy };
}
