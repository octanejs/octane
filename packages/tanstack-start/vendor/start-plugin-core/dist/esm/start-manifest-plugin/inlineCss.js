import { transform } from "lightningcss";
//#region src/start-manifest-plugin/inlineCss.ts
var cssUrlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)|@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)|"([^"]*)"|'([^']*)')/gi;
function createInlineCssUrlPlaceholder(index) {
	return `__TSS INLINE CSS URL ${index}__`;
}
function isRelativeCssUrl(url) {
	if (!url) return false;
	if (url.startsWith("#")) return false;
	if (url.startsWith("/")) return false;
	if (/^[a-z][a-z\d+.-]*:/i.test(url)) return false;
	return true;
}
function shouldTransformInlineCssUrl(url) {
	if (!url) return false;
	if (url.startsWith("#")) return false;
	if (url.startsWith("//")) return false;
	if (/^[a-z][a-z\d+.-]*:/i.test(url)) return false;
	return true;
}
function shouldProcessInlineCssUrls(css, templates) {
	cssUrlPattern.lastIndex = 0;
	for (const match of css.matchAll(cssUrlPattern)) {
		const url = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6] ?? match[7] ?? match[8] ?? "").trim();
		if (templates ? shouldTransformInlineCssUrl(url) : isRelativeCssUrl(url)) return true;
	}
	return false;
}
function rebaseCssUrl(url, cssHref) {
	if (!isRelativeCssUrl(url)) return url;
	const fakeOrigin = "http://tanstack.local";
	const resolved = new URL(url, new URL(cssHref, fakeOrigin));
	if (resolved.origin === fakeOrigin) return `${resolved.pathname}${resolved.search}${resolved.hash}`;
	return resolved.href;
}
function processInlineCssUrls(options) {
	const css = options.css.trim();
	const templates = options.templates === true;
	if (!shouldProcessInlineCssUrls(css, templates)) return { css };
	const urls = [];
	const result = transform({
		filename: options.cssHref,
		code: Buffer.from(css),
		minify: true,
		visitor: {
			Url(url) {
				if (!shouldTransformInlineCssUrl(url.url)) return url;
				const rebasedUrl = rebaseCssUrl(url.url, options.cssHref);
				if (templates) {
					urls.push(rebasedUrl);
					return {
						...url,
						url: createInlineCssUrlPlaceholder(urls.length - 1)
					};
				}
				return {
					...url,
					url: rebasedUrl
				};
			},
			Rule: { import(rule) {
				if (!shouldTransformInlineCssUrl(rule.value.url)) return rule;
				const rebasedUrl = rebaseCssUrl(rule.value.url, options.cssHref);
				if (templates) urls.push(rebasedUrl);
				const value = {
					url: templates ? createInlineCssUrlPlaceholder(urls.length - 1) : rebasedUrl,
					loc: rule.value.loc,
					...rule.value.media ? { media: rule.value.media } : {},
					...rule.value.layer ? { layer: rule.value.layer } : {},
					...rule.value.supports ? { supports: rule.value.supports } : {}
				};
				return {
					...rule,
					value
				};
			} }
		}
	});
	const transformedCss = Buffer.from(result.code).toString("utf8");
	if (!templates || urls.length === 0) return { css: transformedCss };
	return createInlineCssTemplate(transformedCss, urls);
}
function createInlineCssTemplate(cssWithPlaceholders, urls) {
	const strings = [];
	let css = "";
	let cursor = 0;
	for (let index = 0; index < urls.length; index++) {
		const placeholder = createInlineCssUrlPlaceholder(index);
		const placeholderIndex = cssWithPlaceholders.indexOf(placeholder, cursor);
		if (placeholderIndex === -1) throw new Error(`TanStack Start inlineCss could not find CSS URL placeholder: ${placeholder}`);
		const staticPart = cssWithPlaceholders.slice(cursor, placeholderIndex);
		strings.push(staticPart);
		css += staticPart + urls[index];
		cursor = placeholderIndex + placeholder.length;
	}
	const finalStaticPart = cssWithPlaceholders.slice(cursor);
	strings.push(finalStaticPart);
	css += finalStaticPart;
	return {
		css,
		template: {
			strings,
			urls
		}
	};
}
function getCssAssetSource(source) {
	if (typeof source === "string") return source;
	if (source instanceof Uint8Array) return Buffer.from(source).toString("utf8");
	if (source == null) return void 0;
	return String(source);
}
//#endregion
export { getCssAssetSource, processInlineCssUrls };

//# sourceMappingURL=inlineCss.js.map