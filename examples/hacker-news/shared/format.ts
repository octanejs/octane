// Small framework-agnostic formatting helpers.

/** Human "N units ago" for a Unix-seconds timestamp. */
export function relativeTime(unixSecs: number): string {
	const deltaSecs = Math.max(0, Math.floor(Date.now() / 1000 - unixSecs));
	const units: Array<[string, number]> = [
		['year', 31536000],
		['month', 2592000],
		['day', 86400],
		['hour', 3600],
		['minute', 60],
	];
	for (const [name, secs] of units) {
		const n = Math.floor(deltaSecs / secs);
		if (n >= 1) return `${n} ${pluralize(n, name)} ago`;
	}
	return 'just now';
}

export function pluralize(n: number, word: string): string {
	return n === 1 ? word : `${word}s`;
}

/** Bare hostname of a URL, sans leading `www.`; empty string when not a URL. */
export function hostname(url: string | undefined): string {
	if (!url) return '';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}
