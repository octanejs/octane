export type ApiBoundaryError = {
	message: string;
	status: number;
};

export type JsonBodyResult =
	| { success: true; body: unknown }
	| { success: false; error: ApiBoundaryError };

export type TextBodyResult =
	| { success: true; text: string }
	| { success: false; error: ApiBoundaryError };

export type JsonRequestGuardOptions = {
	maxContentLength?: number;
	requireSameOrigin?: boolean;
};

const DEFAULT_JSON_MAX_CONTENT_LENGTH = 64 * 1024;

export function jsonResponse(body: unknown, init?: ResponseInit & { headers?: HeadersInit }) {
	const headers = new Headers(init?.headers);
	headers.set('Content-Type', 'application/json');

	if (!headers.has('Cache-Control')) {
		headers.set('Cache-Control', 'no-store');
	}

	return new Response(JSON.stringify(body), {
		...init,
		headers,
	});
}

export function jsonError(message: string, status: number, headers?: HeadersInit) {
	return jsonResponse({ error: message }, { status, headers });
}

export function validateContentLength(
	request: Request,
	maxContentLength: number,
): ApiBoundaryError | null {
	const header = request.headers.get('content-length');

	if (!header) {
		return null;
	}

	const contentLength = Number(header);
	if (!Number.isFinite(contentLength) || contentLength < 0) {
		return { message: 'Invalid content-length header', status: 400 };
	}

	if (contentLength > maxContentLength) {
		return { message: 'Request body too large', status: 413 };
	}

	return null;
}

export function validateJsonRequest(
	request: Request,
	options: JsonRequestGuardOptions = {},
): ApiBoundaryError | null {
	const contentLengthError = validateContentLength(
		request,
		options.maxContentLength ?? DEFAULT_JSON_MAX_CONTENT_LENGTH,
	);

	if (contentLengthError) {
		return contentLengthError;
	}

	const contentType = request.headers.get('content-type') || '';
	if (!contentType.toLowerCase().includes('application/json')) {
		return {
			message: 'Expected application/json request body',
			status: 415,
		};
	}

	if (options.requireSameOrigin ?? true) {
		return validateSameOriginRequest(request);
	}

	return null;
}

export function validateSameOriginRequest(request: Request) {
	const requestUrl = new URL(request.url);
	const origin = request.headers.get('origin');
	const referer = request.headers.get('referer');
	const secFetchSite = request.headers.get('sec-fetch-site');

	if (origin && origin !== requestUrl.origin) {
		return {
			message: 'Cross-origin requests are not allowed',
			status: 403,
		};
	}

	if (referer) {
		try {
			const refererUrl = new URL(referer);
			if (refererUrl.origin !== requestUrl.origin) {
				return {
					message: 'Cross-origin requests are not allowed',
					status: 403,
				};
			}
		} catch {
			return {
				message: 'Invalid referer header',
				status: 400,
			};
		}
	}

	if (secFetchSite && !['none', 'same-origin', 'same-site'].includes(secFetchSite)) {
		return {
			message: 'Cross-site requests are not allowed',
			status: 403,
		};
	}

	return null;
}

export async function readTextBody(
	request: Request,
	maxContentLength = DEFAULT_JSON_MAX_CONTENT_LENGTH,
): Promise<TextBodyResult> {
	const contentLengthError = validateContentLength(request, maxContentLength);
	if (contentLengthError) {
		return { success: false, error: contentLengthError };
	}

	if (!request.body) {
		try {
			const text = await request.text();
			if (new TextEncoder().encode(text).byteLength > maxContentLength) {
				return {
					success: false,
					error: { message: 'Request body too large', status: 413 },
				};
			}
			return { success: true, text };
		} catch {
			return {
				success: false,
				error: { message: 'Could not read request body', status: 400 },
			};
		}
	}

	const reader = request.body.getReader();
	const chunks: Array<Uint8Array> = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			totalBytes += value.byteLength;
			if (totalBytes > maxContentLength) {
				return {
					success: false,
					error: { message: 'Request body too large', status: 413 },
				};
			}
			chunks.push(value);
		}
	} catch {
		return {
			success: false,
			error: { message: 'Could not read request body', status: 400 },
		};
	} finally {
		reader.releaseLock();
	}

	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return { success: true, text: new TextDecoder().decode(body) };
}

export async function readJsonBody(
	request: Request,
	options: { maxContentLength?: number } = {},
): Promise<JsonBodyResult> {
	const textResult = await readTextBody(
		request,
		options.maxContentLength ?? DEFAULT_JSON_MAX_CONTENT_LENGTH,
	);
	if (!textResult.success) {
		return { success: false, error: textResult.error };
	}

	try {
		const body: unknown = JSON.parse(textResult.text);
		return { success: true, body };
	} catch {
		return {
			success: false,
			error: { message: 'Invalid JSON request body', status: 400 },
		};
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
