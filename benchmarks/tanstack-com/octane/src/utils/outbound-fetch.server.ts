export type FetchWithTimeoutOptions = RequestInit & {
	timeoutMs?: number;
};

export class ResponseTooLargeError extends Error {
	constructor(maxBytes: number) {
		super(`Response body exceeds ${maxBytes} bytes`);
		this.name = 'ResponseTooLargeError';
	}
}

export async function fetchWithTimeout(
	input: string | URL | Request,
	options: FetchWithTimeoutOptions = {},
) {
	const { timeoutMs = 10_000, signal, ...init } = options;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	const abortFromSource = () => controller.abort(signal?.reason);
	if (signal) {
		if (signal.aborted) {
			controller.abort(signal.reason);
		} else {
			signal.addEventListener('abort', abortFromSource, { once: true });
		}
	}

	try {
		return await fetch(input, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener('abort', abortFromSource);
	}
}

export async function readResponseTextWithLimit(response: Response, maxBytes: number) {
	const contentLength = response.headers.get('content-length');
	if (contentLength) {
		const parsedLength = Number(contentLength);
		if (!Number.isFinite(parsedLength) || parsedLength < 0) {
			throw new Error('Invalid content-length header');
		}
		if (parsedLength > maxBytes) {
			throw new ResponseTooLargeError(maxBytes);
		}
	}

	if (!response.body) {
		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > maxBytes) {
			throw new ResponseTooLargeError(maxBytes);
		}
		return text;
	}

	const reader = response.body.getReader();
	const chunks: Array<Uint8Array> = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				throw new ResponseTooLargeError(maxBytes);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return new TextDecoder().decode(body);
}

export async function readResponseJsonWithLimit(
	response: Response,
	maxBytes: number,
): Promise<unknown> {
	const text = await readResponseTextWithLimit(response, maxBytes);
	return JSON.parse(text);
}
