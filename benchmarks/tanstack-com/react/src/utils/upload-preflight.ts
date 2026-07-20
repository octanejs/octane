export const AVATAR_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const SHOWCASE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

const allowedImageTypes = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

function formatBytes(bytes: number) {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export function validateImageUploadFile(file: File, maxBytes: number): string | null {
	if (!allowedImageTypes.has(file.type)) {
		return 'Please select a PNG, JPG, WebP, or GIF image';
	}

	if (file.size > maxBytes) {
		return `Please select an image up to ${formatBytes(maxBytes)}`;
	}

	return null;
}
