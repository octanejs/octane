import * as React from 'react';

export async function copyTextToClipboard(value: string) {
	if (typeof navigator !== 'undefined' && navigator.clipboard) {
		try {
			await navigator.clipboard.writeText(value);
			return;
		} catch {
			// Fall back for restricted contexts where the Clipboard API exists but rejects.
		}
	}

	if (typeof document === 'undefined') {
		throw new Error('Clipboard unavailable');
	}

	const textarea = document.createElement('textarea');
	textarea.value = value;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.left = '-9999px';
	textarea.style.top = '0';

	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();

	let didCopy = false;

	try {
		didCopy = document.execCommand('copy');
	} finally {
		document.body.removeChild(textarea);
	}

	if (!didCopy) {
		throw new Error('Copy failed');
	}
}

export function openPopupWindow(url: string, target = '_blank', features?: string) {
	if (typeof window === 'undefined') {
		return null;
	}

	return window.open(url, target, features);
}

export function openCenteredPopupWindow({
	features,
	height,
	target,
	url,
	width,
}: {
	features?: Array<string>;
	height: number;
	target: string;
	url: string;
	width: number;
}) {
	if (typeof window === 'undefined') {
		return null;
	}

	const left = window.screenX + (window.outerWidth - width) / 2;
	const top = window.screenY + (window.outerHeight - height) / 2;
	const featureList = [
		`width=${width}`,
		`height=${height}`,
		`left=${left}`,
		`top=${top}`,
		...(features ?? []),
	].join(',');

	return openPopupWindow(url, target, featureList);
}

export function useTemporaryFlag(defaultDurationMs = 2000) {
	const [active, setActive] = React.useState(false);
	const timeoutRef = React.useRef<number | null>(null);

	const clearTimer = React.useCallback(() => {
		if (timeoutRef.current !== null) {
			window.clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const trigger = React.useCallback(
		(durationMs = defaultDurationMs) => {
			clearTimer();

			setActive(true);
			timeoutRef.current = window.setTimeout(() => {
				setActive(false);
				timeoutRef.current = null;
			}, durationMs);
		},
		[clearTimer, defaultDurationMs],
	);

	React.useEffect(() => clearTimer, [clearTimer]);

	return { active, trigger };
}
