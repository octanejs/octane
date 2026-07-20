// Native date formatting utilities to replace date-fns
// Uses Intl.DateTimeFormat and Intl.RelativeTimeFormat

const DIVISIONS: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
	{ amount: 60, name: 'seconds' },
	{ amount: 60, name: 'minutes' },
	{ amount: 24, name: 'hours' },
	{ amount: 7, name: 'days' },
	{ amount: 4.34524, name: 'weeks' },
	{ amount: 12, name: 'months' },
	{ amount: Number.POSITIVE_INFINITY, name: 'years' },
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatDistanceToNow(
	date: Date | number,
	options?: { addSuffix?: boolean },
): string {
	const timestamp = typeof date === 'number' ? date : date.getTime();
	let duration = (timestamp - Date.now()) / 1000;

	for (const division of DIVISIONS) {
		if (Math.abs(duration) < division.amount) {
			const formatted = rtf.format(Math.round(duration), division.name);
			// Intl.RelativeTimeFormat always includes direction
			// If addSuffix is false, strip "ago" / "in" but keep relative
			if (options?.addSuffix === false) {
				return formatted.replace(/^in /, '').replace(/ ago$/, '');
			}
			return formatted;
		}
		duration /= division.amount;
	}

	return rtf.format(Math.round(duration), 'years');
}

export function format(date: Date | number, formatStr: string): string {
	const d = typeof date === 'number' ? new Date(date) : date;

	// Common format patterns
	switch (formatStr) {
		case 'PPP':
		case 'MMMM d, yyyy':
			// "April 29, 2023"
			return d.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});

		case 'PP':
			// "Apr 29, 2023"
			return d.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});

		case 'P':
			// "04/29/2023"
			return d.toLocaleDateString('en-US', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			});

		case 'MMM d, yyyy':
		case 'MMM dd, yyyy':
			// "Apr 29, 2023"
			return d.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});

		case 'MMMM yyyy':
			// "April 2023"
			return d.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
			});

		case 'h:mm a':
			// "2:30 PM"
			return d.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				hour12: true,
			});

		case 'PPp':
			// "Apr 29, 2023, 2:30 PM"
			return d.toLocaleString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true,
			});

		default:
			// Fallback to ISO string for unknown formats
			console.warn(`Unknown date format: ${formatStr}, using ISO string`);
			return d.toISOString();
	}
}
