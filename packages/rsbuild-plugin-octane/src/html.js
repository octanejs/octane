// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { validateSsrTemplate } from '@octanejs/app-core/html';

/** @param {string} value */
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rsbuild has already injected the web entry by the time `modifyHTML` runs.
 * Mark the concrete generated tag so the shared production runtime can add a
 * per-request CSP nonce without knowing its hashed filename.
 *
 * @param {string} html
 * @param {Iterable<string>} entryFiles
 */
export function markHydrationEntry(html, entryFiles) {
	validateSsrTemplate(html);
	const javascriptFiles = [...entryFiles].filter((file) => /\.m?js(?:\?.*)?$/.test(file));
	const scriptTags =
		html.match(/<script\b[^>]*\bsrc\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)[^>]*>/gi) ?? [];
	const matches = scriptTags.filter((tag) =>
		javascriptFiles.some((file) =>
			new RegExp(`(?:^|[/"'])${escapeRegExp(file)}(?:[?"']|$)`).test(tag),
		),
	);
	if (matches.length !== 1) {
		throw new Error(
			`[@octanejs/rsbuild-plugin] Expected one generated hydration entry script; found ${matches.length}.`,
		);
	}
	const oldTag = matches[0];
	const nextTag = /\bdata-octane-hydrate\b/i.test(oldTag)
		? oldTag
		: oldTag.replace(/^<script\b/i, '<script data-octane-hydrate');
	return html.replace(oldTag, nextTag);
}

/**
 * Avoid sending app navigations to Rspack's asset middleware, while ensuring
 * Octane's catch-all route never consumes Rsbuild internals or emitted files.
 *
 * @param {URL} url
 * @param {Set<string>} emittedPaths
 * @param {string[]} [publicRoots]
 */
export function isRsbuildOwnedUrl(url, emittedPaths = new Set(), publicRoots = []) {
	const pathname = url.pathname;
	if (
		pathname.startsWith('/__') ||
		pathname.startsWith('/@') ||
		pathname.startsWith('/rsbuild-dev-server') ||
		pathname.includes('/node_modules/')
	) {
		return true;
	}
	const normalized = pathname.replace(/^\/+/, '');
	if (emittedPaths.has(normalized) || emittedPaths.has(pathname)) return true;
	let decoded = normalized;
	try {
		decoded = decodeURIComponent(normalized);
	} catch {
		// Treat malformed percent escapes as an app URL; the router can reject it.
	}
	for (const publicRoot of publicRoots) {
		const root = path.resolve(publicRoot);
		const candidate = path.resolve(root, decoded);
		if (candidate !== root && !candidate.startsWith(root + path.sep)) continue;
		try {
			if (fs.statSync(candidate).isFile()) return true;
		} catch {
			// Missing public files remain available to application routing.
		}
	}
	return false;
}
