const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || 'tanstack.com';

const token =
	process.env.CLOUDFLARE_CACHE_PURGE_TOKEN ||
	process.env.CLOUDFLARE_API_TOKEN ||
	process.env.CF_API_TOKEN;

if (!token) {
	fail('Missing CLOUDFLARE_CACHE_PURGE_TOKEN, CLOUDFLARE_API_TOKEN, or CF_API_TOKEN.');
}

const zoneId =
	process.env.CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID || (await findZoneId(token, ZONE_NAME));

if (!zoneId) {
	fail(
		`Missing CLOUDFLARE_ZONE_ID. Set it directly, or use a token with Zone:Read so ${ZONE_NAME} can be discovered.`,
	);
}

const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
	body: JSON.stringify({ purge_everything: true }),
	headers: {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
	},
	method: 'POST',
});

const payload = await response.json().catch(() => undefined);

if (!isCloudflareResponse(payload) || !response.ok || !payload.success) {
	const message =
		isCloudflareResponse(payload) && payload.errors.length
			? payload.errors
					.map((error) => error.message)
					.filter(Boolean)
					.join('; ')
			: `Cloudflare purge failed with status ${response.status}`;

	fail(message);
}

console.log(`Purged Cloudflare cache for ${ZONE_NAME}.`);

async function findZoneId(apiToken, zoneName) {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}&status=active`,
		{
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
			},
		},
	);

	if (!response.ok) {
		return undefined;
	}

	const payload = await response.json().catch(() => undefined);
	if (!isZoneListResponse(payload)) {
		return undefined;
	}

	const zone = payload.result.find((candidate) => candidate.name === zoneName);
	return zone?.id;
}

function isCloudflareResponse(value) {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof value.success === 'boolean' &&
		Array.isArray(value.errors)
	);
}

function isZoneListResponse(value) {
	return (
		isCloudflareResponse(value) &&
		Array.isArray(value.result) &&
		value.result.every(
			(zone) =>
				typeof zone === 'object' &&
				zone !== null &&
				typeof zone.id === 'string' &&
				typeof zone.name === 'string',
		)
	);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
