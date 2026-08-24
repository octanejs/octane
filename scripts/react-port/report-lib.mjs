import { createHash } from 'node:crypto';

const SENSITIVE_KEY_PATTERN =
	/^(?:authorization|cookie|set-cookie|password|secret|token|(?:api|access|refresh|github|npm|client)[-_]?(?:key|secret|token))$/i;
const SENSITIVE_VALUE_PATTERN =
	/\b(?:gh[oprsu]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|npm_[A-Za-z0-9_]+)\b/g;
const CREDENTIAL_ENV_KEY_PATTERN =
	/(?:^|_)(?:AUTH|ACCESS|REFRESH|API|CLIENT|GITHUB|NPM|NODE_AUTH)?_?(?:TOKEN|KEY|SECRET|PASSWORD)$/i;

function sanitizeUrl(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	url.username = '';
	url.password = '';
	const parameters = [...url.searchParams.entries()]
		.map(([key, parameterValue]) => [
			key,
			SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : parameterValue,
		])
		.sort(([left], [right]) => left.localeCompare(right));
	url.search = '';
	for (const [key, parameterValue] of parameters) url.searchParams.append(key, parameterValue);
	return url.toString();
}

export function credentialValuesFromEnvironment(environment = process.env) {
	return [
		...new Set(
			Object.entries(environment)
				.filter(
					([key, value]) =>
						CREDENTIAL_ENV_KEY_PATTERN.test(key) && typeof value === 'string' && value.length >= 8,
				)
				.map(([, value]) => value),
		),
	].sort((left, right) => right.length - left.length);
}

export function sanitizeForReport(value, key = '', credentialValues = []) {
	if (SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
	if (Array.isArray(value))
		return value.map((item) => sanitizeForReport(item, '', credentialValues));
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([entryKey, entryValue]) => [
				entryKey,
				sanitizeForReport(entryValue, entryKey, credentialValues),
			]),
		);
	}
	if (typeof value === 'string') {
		let sanitizedValue = value;
		for (const credentialValue of credentialValues) {
			sanitizedValue = sanitizedValue.split(credentialValue).join('[REDACTED]');
		}
		const sanitizedUrl = sanitizeUrl(sanitizedValue);
		if (sanitizedUrl) return sanitizedUrl;
		SENSITIVE_VALUE_PATTERN.lastIndex = 0;
		if (SENSITIVE_VALUE_PATTERN.test(sanitizedValue)) {
			SENSITIVE_VALUE_PATTERN.lastIndex = 0;
			return sanitizedValue.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
		}
		return sanitizedValue;
	}
	return value;
}

export function stableStringify(value) {
	function sort(item) {
		if (Array.isArray(item)) return item.map(sort);
		if (item && typeof item === 'object') {
			return Object.fromEntries(
				Object.keys(item)
					.sort()
					.map((key) => [key, sort(item[key])]),
			);
		}
		return item;
	}
	return JSON.stringify(sort(value));
}

export function fingerprint(value) {
	return createHash('sha256').update(stableStringify(value)).digest('hex');
}
