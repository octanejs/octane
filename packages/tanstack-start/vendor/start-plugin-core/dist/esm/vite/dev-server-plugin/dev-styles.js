import path from "node:path";
//#region src/vite/dev-server-plugin/dev-styles.ts
/**
* CSS collection for dev mode.
* Crawls the Vite module graph to collect CSS from the router entry and all its dependencies.
*/
var CSS_FILE_REGEX = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
var CSS_MODULES_REGEX = /\.module\.(css|less|sass|scss|styl|stylus)(?:$|[?#])/i;
function normalizeCssModuleCacheKey(idOrFile) {
	return idOrFile.split("?")[0].split("#")[0].replace(/\\/g, "/");
}
var CSS_SIDE_EFFECT_FREE_PARAMS = [
	"url",
	"inline",
	"raw",
	"inline-css"
];
var VITE_CSS_MARKER = "const __vite__css = ";
var ESCAPE_CSS_COMMENT_START_REGEX = /\/\*/g;
var ESCAPE_CSS_COMMENT_END_REGEX = /\*\//g;
function isCssFile(file) {
	return CSS_FILE_REGEX.test(file);
}
function isCssModulesFile(file) {
	return CSS_MODULES_REGEX.test(file);
}
function hasCssSideEffectFreeParam(url) {
	const queryString = url.split("?")[1];
	if (!queryString) return false;
	const params = new URLSearchParams(queryString);
	return CSS_SIDE_EFFECT_FREE_PARAMS.some((param) => params.get(param) === "" && !url.includes(`?${param}=`) && !url.includes(`&${param}=`));
}
/**
* Resolve a file path to a Vite dev server URL.
* Files within the root directory use relative paths, files outside use /@fs prefix.
*/
function resolveDevUrl(rootDirectory, filePath) {
	const normalizedPath = filePath.replace(/\\/g, "/");
	const relativePath = path.posix.relative(rootDirectory.replace(/\\/g, "/"), normalizedPath);
	if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) return path.posix.join("/", relativePath);
	return path.posix.join("/@fs", normalizedPath);
}
/**
* Collect CSS content from the module graph starting from the given entry points.
*/
async function collectDevStyles(opts) {
	const { viteDevServer, entries, cssModulesCache = {} } = opts;
	const styles = /* @__PURE__ */ new Map();
	const visited = /* @__PURE__ */ new Set();
	const rootDirectory = viteDevServer.config.root;
	await Promise.all(entries.map((entry) => processEntry(viteDevServer, resolveDevUrl(rootDirectory, entry), visited)));
	const cssPromises = [];
	for (const dep of visited) {
		if (hasCssSideEffectFreeParam(dep.url)) continue;
		if (dep.file && isCssModulesFile(dep.file)) {
			const css = cssModulesCache[normalizeCssModuleCacheKey(dep.file)];
			if (!css) continue;
			styles.set(dep.url, css);
			continue;
		}
		if (!isCssFile(dep.file ?? dep.url)) continue;
		cssPromises.push(fetchCssFromModule(viteDevServer, dep).then((css) => css ? [dep.url, css] : null));
	}
	const cssResults = await Promise.all(cssPromises);
	for (const result of cssResults) if (result) styles.set(result[0], result[1]);
	if (styles.size === 0) return void 0;
	const parts = [];
	for (const [fileName, css] of styles.entries()) {
		const escapedFileName = fileName.replace(ESCAPE_CSS_COMMENT_START_REGEX, "/\\*").replace(ESCAPE_CSS_COMMENT_END_REGEX, "*\\/");
		parts.push(`\n/* ${escapedFileName} */\n${css}`);
	}
	return parts.join("\n");
}
/**
* Process an entry URL: transform it if needed, get the module node, and crawl its dependencies.
*/
async function processEntry(viteDevServer, entryUrl, visited) {
	let node = await viteDevServer.moduleGraph.getModuleByUrl(entryUrl);
	if (!node?.ssrTransformResult) {
		try {
			await viteDevServer.transformRequest(entryUrl);
		} catch {}
		node = await viteDevServer.moduleGraph.getModuleByUrl(entryUrl);
	}
	if (!node || visited.has(node)) return;
	visited.add(node);
	await findModuleDeps(viteDevServer, node, visited);
}
/**
* Find all module dependencies by crawling the module graph.
* Uses transformResult.deps for URL-based lookups (parallel) and
* importedModules for already-resolved nodes (parallel).
*/
async function findModuleDeps(viteDevServer, node, visited) {
	const deps = node.ssrTransformResult?.deps ?? node.transformResult?.deps ?? null;
	const importedModules = node.importedModules;
	if ((!deps || deps.length === 0) && importedModules.size === 0) return;
	const branches = [];
	if (deps) for (const depUrl of deps) {
		const dep = await viteDevServer.moduleGraph.getModuleByUrl(depUrl);
		if (!dep) continue;
		if (visited.has(dep)) continue;
		visited.add(dep);
		branches.push(findModuleDeps(viteDevServer, dep, visited));
	}
	for (const depNode of importedModules) {
		if (visited.has(depNode)) continue;
		visited.add(depNode);
		branches.push(findModuleDeps(viteDevServer, depNode, visited));
	}
	if (branches.length === 1) {
		await branches[0];
		return;
	}
	await Promise.all(branches);
}
async function fetchCssFromModule(viteDevServer, node) {
	const cachedCode = node.transformResult?.code ?? node.ssrTransformResult?.code;
	if (cachedCode) return extractCssFromCode(cachedCode);
	try {
		const transformResult = await viteDevServer.transformRequest(node.url);
		if (!transformResult?.code) return void 0;
		return extractCssFromCode(transformResult.code);
	} catch {
		return;
	}
}
/**
* Extract CSS content from Vite's transformed CSS module code.
*
* Vite embeds CSS into the module as a JS string via `JSON.stringify(cssContent)`,
* e.g. `const __vite__css = ${JSON.stringify('...css...')}`.
*
* We locate that JSON string literal and run `JSON.parse` on it to reverse the
* escaping (\\n, \\t, \\", \\\\, \\uXXXX, etc.).
*/
function extractCssFromCode(code) {
	const startIdx = code.indexOf(VITE_CSS_MARKER);
	if (startIdx === -1) return void 0;
	const valueStart = startIdx + 20;
	if (code.charCodeAt(valueStart) !== 34) return void 0;
	const codeLength = code.length;
	let i = valueStart + 1;
	while (i < codeLength) {
		const charCode = code.charCodeAt(i);
		if (charCode === 34) try {
			return JSON.parse(code.slice(valueStart, i + 1));
		} catch {
			return;
		}
		if (charCode === 92) i += 2;
		else i++;
	}
}
//#endregion
export { CSS_MODULES_REGEX, collectDevStyles, normalizeCssModuleCacheKey };

//# sourceMappingURL=dev-styles.js.map