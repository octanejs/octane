//#region src/vite/start-compiler-plugin/hot-update.ts
function mergeHotUpdateModules(currentModules, additionalModules) {
	if (additionalModules.length === 0) return;
	const mergedModules = currentModules.slice();
	const seenModules = new Set(currentModules);
	for (const mod of additionalModules) {
		if (seenModules.has(mod)) continue;
		seenModules.add(mod);
		mergedModules.push(mod);
	}
	return mergedModules;
}
//#endregion
export { mergeHotUpdateModules };

//# sourceMappingURL=hot-update.js.map