const DEFAULT_SITE_ORIGIN = 'https://tanstack.com';

const SAFE_HREF_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function getBaseOrigin(baseUrlOrOrigin?: string) {
	if (!baseUrlOrOrigin) {
		return DEFAULT_SITE_ORIGIN;
	}

	try {
		return new URL(baseUrlOrOrigin).origin;
	} catch {
		return baseUrlOrOrigin.replace(/\/+$/g, '');
	}
}

function hasCredentials(url: URL) {
	return url.username.length > 0 || url.password.length > 0;
}

export function isSafeHref(href: string | undefined | null) {
	if (!href) {
		return false;
	}

	const trimmed = href.trim();

	if (!trimmed) {
		return false;
	}

	if (trimmed.startsWith('#')) {
		return true;
	}

	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
		return true;
	}

	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//')) {
		try {
			const url = new URL(trimmed, DEFAULT_SITE_ORIGIN);
			return SAFE_HREF_PROTOCOLS.has(url.protocol) && !hasCredentials(url);
		} catch {
			return false;
		}
	}

	return true;
}

export function isSafeHttpUrl(value: string | undefined | null) {
	return normalizePublicHttpUrl(value) !== null;
}

export function normalizePublicHttpUrl(value: string | undefined | null) {
	if (!value) return null;

	try {
		const url = new URL(value);
		if ((url.protocol !== 'http:' && url.protocol !== 'https:') || hasCredentials(url)) {
			return null;
		}

		return url.toString();
	} catch {
		return null;
	}
}

export function normalizeSameOriginPath(
	value: string | undefined | null,
	baseUrlOrOrigin: string,
	maxLength = 2048,
) {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	if (!trimmed || trimmed.length > maxLength) {
		return null;
	}

	const baseOrigin = getBaseOrigin(baseUrlOrOrigin);

	try {
		const url = new URL(trimmed, baseOrigin);

		if (url.origin !== baseOrigin || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
			return null;
		}

		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return null;
	}
}

function isStaticAssetPath(pathname: string) {
	const [pathWithoutQuery] = pathname.split(/[?#]/);
	return /\.[a-z0-9]+$/i.test(pathWithoutQuery) && !pathWithoutQuery.endsWith('.md');
}

export function getRoutableInternalLinkTarget(
	href: string | undefined | null,
	siteOrigin = DEFAULT_SITE_ORIGIN,
) {
	if (!href) {
		return null;
	}

	const trimmed = href.trim();
	if (!trimmed || trimmed.startsWith('#')) {
		return null;
	}

	const isRootRelative = trimmed.startsWith('/') && !trimmed.startsWith('//');
	const isAbsoluteOrProtocolRelative =
		/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//');

	if (!isRootRelative && !isAbsoluteOrProtocolRelative) {
		return null;
	}

	const baseOrigin = getBaseOrigin(siteOrigin);

	let url: URL;
	try {
		url = new URL(trimmed, baseOrigin);
	} catch {
		return null;
	}

	if (url.origin !== baseOrigin || hasCredentials(url)) {
		return null;
	}

	const path = `${url.pathname}${url.search}`;
	const isRoutableInternal =
		url.pathname.startsWith('/') &&
		!url.pathname.startsWith('//') &&
		url.pathname !== '/api' &&
		!url.pathname.startsWith('/api/') &&
		!isStaticAssetPath(url.pathname);

	if (!isRoutableInternal) {
		return null;
	}

	const hash = url.hash ? url.hash.slice(1) : undefined;
	return { path, hash };
}
