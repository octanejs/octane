const HTML_ID_SEGMENT_PATTERN = /[^a-zA-Z0-9_-]+/g;

export function encodePackageNameSlug(packageName: string) {
	return encodeURIComponent(packageName);
}

export function decodePackageNameSlug(slug: string) {
	let next = slug;

	for (let i = 0; i < 2; i++) {
		try {
			const decoded = decodeURIComponent(next);
			if (decoded === next) {
				return decoded;
			}
			next = decoded;
		} catch {
			return slug;
		}
	}

	return next;
}

export function getRowFieldId(scope: string, rowId: string | number, field: string) {
	return [scope, rowId, field].map(sanitizeHtmlIdSegment).join('-');
}

function sanitizeHtmlIdSegment(value: string | number) {
	const segment = String(value).trim().replace(HTML_ID_SEGMENT_PATTERN, '-');
	return segment.replace(/^-+|-+$/g, '') || 'item';
}
