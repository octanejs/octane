import { purgeHostCacheTags } from '~/server/runtime/host.server';

export type PurgeResult =
	| { purged: true; tags: Array<string> }
	| {
			error?: string;
			purged: false;
			reason: 'no-tags' | 'no-credentials' | 'error';
	  };

type CachePurgeApiResponse = {
	errors?: Array<{ message?: string }>;
	success?: boolean;
};

export async function purgeHostingCacheTags(tags: Array<string>): Promise<PurgeResult> {
	const uniqueTags = Array.from(new Set(tags)).filter((tag) => tag.length > 0);

	if (uniqueTags.length === 0) {
		return { purged: false, reason: 'no-tags' };
	}

	try {
		const response = await purgeHostCacheTags(uniqueTags);

		if (!response) {
			return { purged: false, reason: 'no-credentials' };
		}

		const payload: unknown = await response.json();
		if (!isCachePurgeApiResponse(payload)) {
			throw new Error('Invalid cache purge API response');
		}

		if (!response.ok || payload.success === false) {
			const message =
				payload.errors
					?.map((error) => error.message)
					.filter((message) => typeof message === 'string')
					.join('; ') || `Cache purge failed with status ${response.status}`;
			throw new Error(message);
		}

		return { purged: true, tags: uniqueTags };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[hosting-cache] cache purge failed', {
			message,
			tags: uniqueTags,
		});
		return { error: message, purged: false, reason: 'error' };
	}
}

function isCachePurgeApiResponse(value: unknown): value is CachePurgeApiResponse {
	if (typeof value !== 'object' || value === null) return false;

	const errors = 'errors' in value ? value.errors : undefined;
	const success = 'success' in value ? value.success : undefined;

	const isSuccessValid = success === undefined || typeof success === 'boolean';
	const isErrorsValid =
		errors === undefined ||
		(Array.isArray(errors) &&
			errors.every(
				(error) =>
					typeof error === 'object' &&
					error !== null &&
					(!('message' in error) || typeof error.message === 'string'),
			));

	return isSuccessValid && isErrorsValid;
}
