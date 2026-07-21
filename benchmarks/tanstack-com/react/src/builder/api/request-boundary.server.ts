import {
	jsonError,
	jsonResponse,
	readJsonBody,
	validateJsonRequest,
	validateSameOriginRequest,
} from '~/utils/api-boundary.server';
import {
	checkIpRateLimit,
	RATE_LIMITS,
	rateLimitedResponse,
	type RateLimitOptions,
	type RateLimitResult,
} from '~/utils/rateLimit.server';

const BUILDER_JSON_MAX_BYTES = 128 * 1024;

export type BuilderJsonRequestResult<T> =
	{ body: T; rateLimit: RateLimitResult } | { response: Response };

export async function readBuilderJsonRequest(
	request: Request,
	options: { rateLimit?: RateLimitOptions } = {},
): Promise<BuilderJsonRequestResult<unknown>> {
	const rateLimit = await checkIpRateLimit(
		request,
		options.rateLimit ?? RATE_LIMITS.builderCompile,
	);
	if (!rateLimit.allowed) {
		return { response: rateLimitedResponse(rateLimit) };
	}

	const guardError = validateJsonRequest(request, {
		maxContentLength: BUILDER_JSON_MAX_BYTES,
	});
	if (guardError) {
		return {
			response: jsonError(guardError.message, guardError.status, rateLimit.headers),
		};
	}

	const result = await readJsonBody(request, {
		maxContentLength: BUILDER_JSON_MAX_BYTES,
	});
	if (!result.success) {
		return {
			response: jsonError(result.error.message, result.error.status, rateLimit.headers),
		};
	}

	return { body: result.body, rateLimit };
}

export async function validateBuilderGetRequest(
	request: Request,
	options: { rateLimit?: RateLimitOptions } = {},
) {
	const rateLimit = await checkIpRateLimit(
		request,
		options.rateLimit ?? RATE_LIMITS.builderCompile,
	);
	if (!rateLimit.allowed) {
		return { response: rateLimitedResponse(rateLimit) };
	}

	const sameOriginError = validateSameOriginRequest(request);
	if (sameOriginError) {
		return {
			response: jsonError(sameOriginError.message, sameOriginError.status, rateLimit.headers),
		};
	}

	return { rateLimit };
}

export function builderJsonResponse(body: unknown, rateLimit?: RateLimitResult) {
	return jsonResponse(body, { headers: rateLimit?.headers });
}

export function builderErrorResponse(message: string, status: number, rateLimit?: RateLimitResult) {
	return jsonError(message, status, rateLimit?.headers);
}

export function builderInternalErrorResponse(message: string) {
	return jsonError(message, 500);
}
