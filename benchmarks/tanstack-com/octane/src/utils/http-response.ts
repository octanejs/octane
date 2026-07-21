type ContentDispositionType = 'attachment' | 'inline';

const FILENAME_SEPARATOR_PATTERN = /[\\/]+/g;
const QUOTE_PATTERN = /["]+/g;
const UNSAFE_FILENAME_CHAR_PATTERN = /[*:<>?|]+/g;
const MULTIPLE_DASH_PATTERN = /-+/g;
const MAX_RESPONSE_FILENAME_LENGTH = 180;

export function sanitizeResponseFilename(value: string | null | undefined, fallback = 'download') {
	const fallbackName = sanitizeFilenameText(fallback) || 'download';
	const filename = sanitizeFilenameText(value);

	return filename || fallbackName;
}

export function getContentDispositionHeader(
	type: ContentDispositionType,
	filename: string | null | undefined,
	fallback?: string,
) {
	const safeFilename = sanitizeResponseFilename(filename, fallback);
	const quotedFilename = safeFilename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	const encodedFilename = encodeRFC5987Value(safeFilename);

	return `${type}; filename="${quotedFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function sanitizeFilenameText(value: string | null | undefined) {
	const cleaned = String(value ?? '')
		.normalize('NFKC')
		.split('')
		.filter((char) => {
			const code = char.charCodeAt(0);
			return code > 31 && code !== 127;
		})
		.join('')
		.replace(FILENAME_SEPARATOR_PATTERN, '-')
		.replace(QUOTE_PATTERN, '')
		.replace(UNSAFE_FILENAME_CHAR_PATTERN, '-')
		.replace(/\s+/g, '-')
		.replace(MULTIPLE_DASH_PATTERN, '-')
		.replace(/^[.-]+|[.-]+$/g, '')
		.slice(0, MAX_RESPONSE_FILENAME_LENGTH)
		.trim();

	return cleaned.replace(/^[.-]+|[.-]+$/g, '');
}

function encodeRFC5987Value(value: string) {
	return encodeURIComponent(value).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}
