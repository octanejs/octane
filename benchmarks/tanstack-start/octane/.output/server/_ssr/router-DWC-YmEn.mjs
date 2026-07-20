import { I as warmChild, L as withSlot, O as startTransition, P as useState, S as ssrHeadEl, T as ssrSnapshotSpread, b as ssrControl, c as markChildrenBlock, f as ssrArm, g as ssrChild, h as ssrBlock, i as createElement, m as ssrAttrs, o as hookSlots, t as HYDRATION_RANGE_BOUNDARY, u as puBatch, v as ssrChildrenSources, w as ssrScriptInnerHtml, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { A as deepEqual, _ as resolveManifestCssLink, a as ErrorComponent, b as createNonReactiveReadonlyStore, c as splitSlot, d as useRouter, f as batch, g as getScriptPreloadAttrs, h as getAssetCrossOrigin, i as useHydrated, j as escapeHtml, l as subSlot, m as appendUniqueUserTags, o as Outlet, p as createAtom, s as useStore, v as RouterCore, y as createNonReactiveMutableStore } from "./ssr.mjs";
import { t as Link } from "./Link-D-hvCIHY.mjs";
import { i as lazyRouteComponent, n as createRootRoute, o as useLocation, t as createFileRoute } from "./createSsrRpc-BTuhnJRJ.mjs";
import { t as Route$3 } from "./deferred-IixyGkTF.mjs";
import { t as Route$4 } from "./posts-DLafmRVu.mjs";
import { t as Route$5 } from "./posts._postId-CxfE0ez-.mjs";
import { t as NotFound } from "./NotFound-BeYZdRm2.mjs";
import { t as CustomMessage } from "./CustomMessage-CGt94cqn.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-DWC-YmEn.js
var isServerEnvironment = typeof document === "undefined";
var octaneStoreFactory = (options) => {
	if (options.isServer ?? isServerEnvironment) return {
		createMutableStore: createNonReactiveMutableStore,
		createReadonlyStore: createNonReactiveReadonlyStore,
		batch: (callback) => callback()
	};
	return {
		createMutableStore: createAtom,
		createReadonlyStore: createAtom,
		batch: (callback) => startTransition(() => batch(callback))
	};
};
var createRouter = (options) => new Router(options);
var Router = class extends RouterCore {
	constructor(options) {
		super(options, octaneStoreFactory);
	}
};
var _hs$$3 = /* @__PURE__ */ hookSlots(3);
var _h$0$3 = /* @__PURE__ */ Symbol(_hs$$3);
var _h$1$3 = /* @__PURE__ */ Symbol(_hs$$3 + 1);
var Asset = function Asset(props, __s, __extra) {
	withSlot(_h$0$3, useRouter, _h$0$3);
	withSlot(_h$1$3, useHydrated, _h$1$3);
	function __sif$0(__props, __s, __extra) {
		function __scase$1(__props, __s, __extra) {
			ssrHeadEl("rnh-14rn8ym", "title", {
				...props.attrs,
				"data-tsr-managed-key": props.assetKey
			}, props.children ?? "");
			return "";
		}
		function __scase$2(__props, __s, __extra) {
			ssrHeadEl("rnh-14rnahq", "meta", {
				...props.attrs,
				"data-tsr-managed-key": props.assetKey
			}, null);
			return "";
		}
		function __scase$3(__props, __s, __extra) {
			ssrHeadEl("rnh-14rnbb4", "link", {
				...props.attrs,
				"data-tsr-managed-key": props.assetKey
			}, null);
			return "";
		}
		function __scase$4(__props, __s, __extra) {
			return ssrChild(createElement("style", {
				...props.attrs,
				"data-tsr-managed-key": props.assetKey,
				dangerouslySetInnerHTML: { __html: props.children ?? "" }
			}), __s);
		}
		function __scase$5(__props, __s, __extra) {
			return (() => {
				const __sp0 = ssrSnapshotSpread(props.attrs);
				const __sp1 = props.assetKey;
				const __sp2 = { __html: props.children ?? "" };
				return "<script" + ssrAttrs([[true, __sp0], [
					false,
					"data-tsr-managed-key",
					__sp1
				]], "script", "opaque", false) + ">" + (ssrScriptInnerHtml([[__sp0 != null && Object.prototype.propertyIsEnumerable.call(__sp0, "dangerouslySetInnerHTML"), __sp0 != null ? __sp0.dangerouslySetInnerHTML : void 0], [true, __sp2]], () => ssrChildrenSources([[__sp0 != null && Object.prototype.propertyIsEnumerable.call(__sp0, "children"), __sp0 != null ? __sp0.children : void 0]], () => "", __s), false, [[__sp0 != null && Object.prototype.propertyIsEnumerable.call(__sp0, "children"), __sp0 != null ? __sp0.children : void 0]]) ?? ssrChildrenSources([[__sp0 != null && Object.prototype.propertyIsEnumerable.call(__sp0, "children"), __sp0 != null ? __sp0.children : void 0]], () => "", __s)) + "<\/script>";
			})();
		}
		function __scase$6(__props, __s, __extra) {
			return "";
		}
		return ssrBlock(ssrControl("sj9jhwu", () => {
			const __d = props.tag;
			return __d === "title" ? ssrArm("case:0", () => ssrBlock(__scase$1(void 0, __s))) : __d === "meta" ? ssrArm("case:1", () => ssrBlock(__scase$2(void 0, __s))) : __d === "link" ? ssrArm("case:2", () => ssrBlock(__scase$3(void 0, __s))) : __d === "style" ? ssrArm("case:3", () => ssrBlock(__scase$4(void 0, __s))) : __d === "script" ? ssrArm("case:4", () => ssrBlock(__scase$5(void 0, __s))) : ssrArm("default", () => ssrBlock(__scase$6(void 0, __s)));
		}));
	}
	return ssrBlock(ssrControl("i11vujgp", () => ssrArm("then", () => ssrBlock(__sif$0(void 0, __s)))));
};
function getAssetKey(scope, asset, index) {
	const inlineCss = asset.tag === "style" && asset.inlineCss;
	return `${scope}:${index}:${JSON.stringify({
		tag: asset.tag,
		attrs: asset.attrs,
		children: inlineCss ? void 0 : asset.children,
		inlineCss
	})}`;
}
function buildTagsFromMatches(router, nonce, matches, assetCrossOrigin) {
	const routeMeta = matches.map((match) => match.meta).filter((meta) => meta !== void 0);
	const resultMeta = [];
	const metaByAttribute = {};
	let title;
	for (let i = routeMeta.length - 1; i >= 0; i--) {
		const metas = routeMeta[i];
		for (let j = metas.length - 1; j >= 0; j--) {
			const meta = metas[j];
			if (!meta) continue;
			if ("title" in meta && typeof meta.title === "string") title ??= {
				tag: "title",
				children: meta.title
			};
			else if ("script:ld+json" in meta) try {
				resultMeta.push({
					tag: "script",
					attrs: { type: "application/ld+json" },
					children: escapeHtml(JSON.stringify(meta["script:ld+json"]))
				});
			} catch {}
			else {
				const attribute = ("name" in meta && typeof meta.name === "string" ? meta.name : void 0) ?? ("property" in meta && typeof meta.property === "string" ? meta.property : void 0);
				if (attribute && metaByAttribute[attribute]) continue;
				if (attribute) metaByAttribute[attribute] = true;
				resultMeta.push({
					tag: "meta",
					attrs: {
						...meta,
						nonce
					}
				});
			}
		}
	}
	if (title) resultMeta.push(title);
	if (nonce) resultMeta.push({
		tag: "meta",
		attrs: {
			property: "csp-nonce",
			content: nonce
		}
	});
	resultMeta.reverse();
	const links = matches.flatMap((match) => match.links ?? []).filter((link) => link !== void 0).map((link) => ({
		tag: "link",
		attrs: {
			...link,
			nonce
		}
	}));
	const manifestTags = [];
	const preloadTags = [];
	const manifest = router.ssr?.manifest;
	if (manifest) {
		for (const match of matches) {
			for (const link of manifest.routes[match.routeId]?.css ?? []) {
				const resolvedLink = resolveManifestCssLink(link);
				manifestTags.push({
					tag: "link",
					attrs: {
						rel: "stylesheet",
						...resolvedLink,
						crossOrigin: getAssetCrossOrigin(assetCrossOrigin, "stylesheet") ?? resolvedLink.crossOrigin,
						nonce
					}
				});
			}
			for (const preload of manifest.routes[match.routeId]?.preloads ?? []) preloadTags.push({
				tag: "link",
				attrs: {
					...getScriptPreloadAttrs(manifest, preload, assetCrossOrigin),
					nonce
				}
			});
		}
		if (manifest.inlineStyle) manifestTags.push({
			tag: "style",
			attrs: {
				...manifest.inlineStyle.attrs,
				nonce
			},
			children: manifest.inlineStyle.children,
			inlineCss: true
		});
	}
	const styles = matches.flatMap((match) => match.styles ?? []).filter((style) => style !== void 0).map(({ children, ...attrs }) => ({
		tag: "style",
		attrs: {
			...attrs,
			nonce
		},
		children
	}));
	const headScripts = matches.flatMap((match) => match.headScripts ?? []).filter((script) => script !== void 0).map(({ children, ...attrs }) => ({
		tag: "script",
		attrs: {
			...attrs,
			nonce
		},
		children
	}));
	const tags = [];
	appendUniqueUserTags(tags, resultMeta);
	tags.push(...preloadTags);
	appendUniqueUserTags(tags, links);
	tags.push(...manifestTags);
	appendUniqueUserTags(tags, styles);
	appendUniqueUserTags(tags, headScripts);
	return tags;
}
function useTags(...args) {
	const [userArgs, slot] = splitSlot(args);
	const assetCrossOrigin = userArgs[0];
	const router = useRouter();
	const nonce = router.options.ssr?.nonce;
	return buildTagsFromMatches(router, nonce, router.stores.matches.get(), assetCrossOrigin);
}
var _hs$$2 = /* @__PURE__ */ hookSlots(3);
var _h$0$2 = /* @__PURE__ */ Symbol(_hs$$2);
var _h$1$2 = /* @__PURE__ */ Symbol(_hs$$2 + 1);
var HeadContent = function HeadContent(props, __s, __extra) {
	const tags = withSlot(_h$0$2, useTags, props.assetCrossOrigin, _h$0$2);
	withSlot(_h$1$2, useHydrated, _h$1$2);
	return ssrChild(tags.map((tag, index) => createElement(Asset, {
		...tag,
		assetKey: getAssetKey("head", tag, index),
		target: "head",
		key: getAssetKey("head", tag, index)
	})), __s);
};
function getScripts(router, matches) {
	const nonce = router.options.ssr?.nonce;
	const scripts = matches.flatMap((match) => match.scripts ?? []).filter((script) => script !== void 0).map(({ children, ...attrs }) => ({
		tag: "script",
		attrs: {
			...attrs,
			nonce
		},
		children
	}));
	const manifest = router.ssr?.manifest;
	if (manifest) for (const match of matches) for (const asset of manifest.routes[match.routeId]?.scripts ?? []) scripts.push({
		tag: "script",
		attrs: {
			...asset.attrs,
			nonce
		},
		children: asset.children
	});
	return scripts;
}
function useScripts(...args) {
	const [, slot] = splitSlot(args);
	const router = useRouter();
	{
		const scripts = getScripts(router, router.stores.matches.get());
		const buffered = router.serverSsr?.takeBufferedScripts();
		if (!buffered || buffered.tag !== "script") return scripts;
		return [{
			tag: "script",
			attrs: buffered.attrs,
			children: typeof buffered.children === "string" ? buffered.children.replace(/;document\.currentScript\.remove\(\)$/, "") : buffered.children
		}, ...scripts];
	}
	return useStore(router.stores.matches, (matches) => getScripts(router, matches), deepEqual, subSlot(slot, "body:scripts"));
}
var _hs$$1 = /* @__PURE__ */ hookSlots(4);
var _h$0$1 = /* @__PURE__ */ Symbol(_hs$$1);
var _h$1$1 = /* @__PURE__ */ Symbol(_hs$$1 + 1);
var Scripts = function Scripts(__props, __s, __extra) {
	withSlot(_h$0$1, useRouter, _h$0$1);
	const scripts = withSlot(_h$1$1, useScripts, _h$1$1);
	const [hydrating, setHydrating] = useState(true, 2);
	return ssrChild(scripts.map((script, index) => {
		const assetKey = getAssetKey("body", script, index);
		return createElement("script", {
			...script.attrs,
			key: assetKey,
			"data-tsr-managed-key": assetKey,
			dangerouslySetInnerHTML: { __html: script.children ?? "" }
		});
	}), __s);
};
var Html = (props) => {
	useRouter();
	const { children, ...attrs } = props;
	return createElement("html", attrs, children);
};
var Head = (props) => {
	useRouter();
	const { children, ...attrs } = props;
	return createElement("head", attrs, children);
};
var HydrationRangeOwner = (props) => props.children;
HydrationRangeOwner[HYDRATION_RANGE_BOUNDARY] = "owner";
var Body = (props) => {
	useRouter();
	const { children, ...attrs } = props;
	return createElement("body", attrs, createElement("div", { id: "__app" }, createElement(HydrationRangeOwner, {}, children)));
};
var _hs$ = /* @__PURE__ */ hookSlots(2);
var _h$0 = /* @__PURE__ */ Symbol(_hs$);
var _h$1 = /* @__PURE__ */ Symbol(_hs$ + 1);
var DefaultCatchBoundary = function DefaultCatchBoundary(props, __s, __extra) {
	withSlot(_h$0, useRouter, _h$0);
	const isRoot = withSlot(_h$1, useLocation, { select: (location) => location.pathname === "/" }, _h$1);
	console.error(props.error);
	puBatch([], () => {
		warmChild(ErrorComponent, { error: props.error });
	});
	function __sif$0(__props, __s, __extra) {
		function __schildren$1(__props, __s, __extra) {
			return "\n					Home\n				";
		}
		return ssrComponent(__s, Link, {
			"to": "/",
			"class": "px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold",
			"children": markChildrenBlock(__schildren$1)
		});
	}
	function __selse$2(__props, __s, __extra) {
		function __schildren$3(__props, __s, __extra) {
			return "\n					Go Back\n				";
		}
		return ssrComponent(__s, Link, {
			"to": "/",
			"class": "px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold",
			"onClick": ((e) => {
				e.preventDefault();
				window.history.back();
			}),
			"children": markChildrenBlock(__schildren$3)
		});
	}
	return "<div class=\"min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6\">" + ssrComponent(__s, ErrorComponent, { "error": props.error }) + "<div class=\"flex gap-2 items-center flex-wrap\"><button class=\"px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold\">\n				Try Again\n			</button>" + ssrBlock(ssrControl("i11vp679", () => isRoot ? ssrArm("then", () => ssrBlock(__sif$0(void 0, __s))) : ssrArm("else", () => ssrBlock(__selse$2(void 0, __s))))) + "</div></div>";
};
DefaultCatchBoundary.__warm = (__wp) => {
	warmChild(ErrorComponent, { error: __wp.error });
};
var seo = ({ title, description, keywords, image }) => {
	return [
		{ title },
		{
			name: "description",
			content: description
		},
		{
			name: "keywords",
			content: keywords
		},
		{
			name: "twitter:title",
			content: title
		},
		{
			name: "twitter:description",
			content: description
		},
		{
			name: "twitter:creator",
			content: "@tannerlinsley"
		},
		{
			name: "twitter:site",
			content: "@tannerlinsley"
		},
		{
			name: "og:type",
			content: "website"
		},
		{
			name: "og:title",
			content: title
		},
		{
			name: "og:description",
			content: description
		},
		...image ? [
			{
				name: "twitter:image",
				content: image
			},
			{
				name: "twitter:card",
				content: "summary_large_image"
			},
			{
				name: "og:image",
				content: image
			}
		] : []
	];
};
var Route$2 = createRootRoute({
	head: () => ({ meta: [
		{ charSet: "utf-8" },
		{
			name: "viewport",
			content: "width=device-width, initial-scale=1"
		},
		...seo({
			title: "TanStack Start Bench",
			description: "The same Start application, served by two frameworks."
		})
	] }),
	shellComponent: RootDocument,
	component: RootLayout,
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: NotFound
});
function RootDocument(props, __s, __extra) {
	function __schildren$0(__props, __s, __extra) {
		function __schildren$1(__props, __s, __extra) {
			return ssrComponent(__s, HeadContent, {});
		}
		function __schildren$2(__props, __s, __extra) {
			return ssrChild(props.children, __s) + ssrComponent(__s, Scripts, {});
		}
		return ssrComponent(__s, Head, { "children": markChildrenBlock(__schildren$1) }) + ssrComponent(__s, Body, { "children": markChildrenBlock(__schildren$2) });
	}
	return ssrComponent(__s, Html, {
		"lang": "en",
		"children": markChildrenBlock(__schildren$0)
	}, true);
}
function RootLayout(__props, __s, __extra) {
	puBatch([], () => {
		warmChild(Outlet, {});
	});
	function __schildren$3(__props, __s, __extra) {
		return "\n				Home\n			";
	}
	function __schildren$4(__props, __s, __extra) {
		return "\n				Posts\n			";
	}
	function __schildren$5(__props, __s, __extra) {
		return "\n				Deferred\n			";
	}
	return "<nav class=\"p-2 flex gap-2 text-lg\" data-testid=\"root-nav\">" + ssrComponent(__s, Link, {
		"to": "/",
		"activeProps": { class: "font-bold" },
		"activeOptions": { exact: true },
		"children": markChildrenBlock(__schildren$3)
	}) + ssrComponent(__s, Link, {
		"to": "/posts",
		"activeProps": { class: "font-bold" },
		"children": markChildrenBlock(__schildren$4)
	}) + ssrComponent(__s, Link, {
		"to": "/deferred",
		"activeProps": { class: "font-bold" },
		"children": markChildrenBlock(__schildren$5)
	}) + "</nav><hr/>" + ssrComponent(__s, Outlet, {});
}
typeof RootLayout === "function" && (RootLayout.__warm = (__wp) => {
	warmChild(Outlet, {});
});
var $$splitComponentImporter$1 = () => import("./routes-T4vUIA1D.mjs");
var Route$1 = createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter$1, "component") });
typeof Home === "function" && (Home.__warm = (__wp) => {
	warmChild(CustomMessage, { message: "Hello from a custom component!" });
});
var $$splitComponentImporter = () => import("./posts.index-BK6p-n8n.mjs");
var Route = createFileRoute("/posts/")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
var IndexRoute = Route$1.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$2
});
var DeferredRoute = Route$3.update({
	id: "/deferred",
	path: "/deferred",
	getParentRoute: () => Route$2
});
var PostsRoute = Route$4.update({
	id: "/posts",
	path: "/posts",
	getParentRoute: () => Route$2
});
var PostsIndexRoute = Route.update({
	id: "/",
	path: "/",
	getParentRoute: () => PostsRoute
});
var PostsRouteChildren = {
	PostsPostIdRoute: Route$5.update({
		id: "/$postId",
		path: "/$postId",
		getParentRoute: () => PostsRoute
	}),
	PostsIndexRoute
};
var rootRouteChildren = {
	IndexRoute,
	DeferredRoute,
	PostsRoute: PostsRoute._addFileChildren(PostsRouteChildren)
};
var routeTree = Route$2._addFileChildren(rootRouteChildren)._addFileTypes();
function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultErrorComponent: DefaultCatchBoundary,
		defaultNotFoundComponent: NotFound
	});
}
//#endregion
export { getRouter };
