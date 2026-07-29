import { escapeAttr } from 'octane/server';

const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;
const ABSOLUTE_ASSET = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i;

function escapeDocumentAttribute(value) {
	const escaped = escapeAttr(value);
	return /[<>]/.test(escaped) ? escaped.replace(/</g, '&lt;').replace(/>/g, '&gt;') : escaped;
}

function attributeString(attributes) {
	let result = '';
	for (const [name, value] of Object.entries(attributes ?? {})) {
		if (!ATTRIBUTE_NAME.test(name)) {
			throw new TypeError(`Invalid Docusaurus document attribute name: ${JSON.stringify(name)}.`);
		}
		if (value === undefined || value === null || value === false) continue;
		result += value === true ? ` ${name}` : ` ${name}="${escapeDocumentAttribute(String(value))}"`;
	}
	return result;
}

function assetSource(asset, name) {
	if (typeof asset === 'string') return asset;
	if (asset !== null && typeof asset === 'object' && typeof asset[name] === 'string') {
		return asset[name];
	}
	throw new TypeError(`Expected a Docusaurus ${name} asset.`);
}

function assetUrl(baseUrl, value) {
	if (ABSOLUTE_ASSET.test(value)) return value;
	return `${baseUrl}${value.replace(/^\.\//, '')}`;
}

function assetAttributes(asset, sourceName, baseUrl, baseAttributes) {
	if (typeof asset === 'string') {
		return {
			...baseAttributes,
			[sourceName]: assetUrl(baseUrl, asset),
		};
	}
	const { integrity, crossOrigin, referrerPolicy, media, async, defer, type } = asset;
	return {
		...baseAttributes,
		[sourceName]: assetUrl(baseUrl, assetSource(asset, sourceName)),
		...(integrity === undefined ? {} : { integrity }),
		...(crossOrigin === undefined ? {} : { crossorigin: crossOrigin }),
		...(referrerPolicy === undefined ? {} : { referrerpolicy: referrerPolicy }),
		...(media === undefined ? {} : { media }),
		...(async === undefined ? {} : { async }),
		...(defer === undefined ? {} : { defer }),
		...(type === undefined ? {} : { type }),
	};
}

function uniqueAssets(assets, sourceName) {
	const result = [];
	const seen = new Set();
	for (const asset of assets ?? []) {
		const source = assetSource(asset, sourceName);
		if (seen.has(source)) continue;
		seen.add(source);
		result.push(asset);
	}
	return result;
}

function renderAssets(manifest, assets, nonce) {
	const stylesheets = uniqueAssets(assets?.stylesheets, 'href').map((asset) => {
		const attributes = assetAttributes(asset, 'href', manifest.baseUrl, {
			rel: 'stylesheet',
		});
		return `<link${attributeString(attributes)}>`;
	});
	const modulePreloads = uniqueAssets(assets?.modulePreloads, 'href').map((asset) => {
		const attributes = assetAttributes(asset, 'href', manifest.baseUrl, {
			rel: 'modulepreload',
		});
		return `<link${attributeString(attributes)}>`;
	});
	const scripts = uniqueAssets(assets?.scripts, 'src').map((asset) => {
		const attributes = assetAttributes(asset, 'src', manifest.baseUrl, {
			type: 'module',
			...(nonce === undefined ? {} : { nonce }),
		});
		return `<script${attributeString(attributes)}></script>`;
	});
	return [...stylesheets, ...modulePreloads, ...scripts];
}

function renderHydrationEntry(manifest, hydrate, nonce) {
	if (hydrate === undefined) return '';
	const attributes = assetAttributes(hydrate, 'src', manifest.baseUrl, {
		type: 'module',
		'data-octane-hydrate': true,
		...(nonce === undefined ? {} : { nonce }),
	});
	return `<script${attributeString(attributes)}></script>`;
}

function renderFavicon(manifest) {
	if (manifest.site.favicon === undefined) return '';
	return `<link${attributeString({
		rel: 'icon',
		href: assetUrl(manifest.baseUrl, manifest.site.favicon),
	})}>`;
}

/**
 * Compose one route render into the real Docusaurus HTML document.
 *
 * Plugin-provided head/body tag strings were produced by Docusaurus's
 * `injectHtmlTags` lifecycle and are intentionally treated as trusted site
 * configuration. Attributes and build asset descriptors supplied here are
 * escaped before insertion.
 */
export function renderDocusaurusDocument(rendered, manifest, options = {}) {
	const htmlAttributes = {
		...manifest.document.htmlAttributes,
		...options.htmlAttributes,
	};
	const head = [
		'<meta charset="UTF-8">',
		`<meta name="generator" content="Docusaurus v${escapeDocumentAttribute(
			manifest.docusaurusVersion,
		)}">`,
		renderFavicon(manifest),
		manifest.document.headTags,
		rendered.head,
		rendered.css,
		...renderAssets(manifest, options.assets, options.nonce),
	].filter((value) => value !== '');
	const hydration = renderHydrationEntry(manifest, options.hydrate, options.nonce);
	const body = [
		manifest.document.preBodyTags,
		`<div id="${escapeDocumentAttribute(options.rootId ?? '__docusaurus')}">${rendered.html}</div>`,
		manifest.document.postBodyTags,
		hydration,
	].filter((value) => value !== '');

	return [
		'<!DOCTYPE html>',
		`<html${attributeString(htmlAttributes)}>`,
		'<head>',
		...head,
		'</head>',
		`<body${attributeString(options.bodyAttributes)}>`,
		...body,
		'</body>',
		'</html>',
	].join('\n');
}
