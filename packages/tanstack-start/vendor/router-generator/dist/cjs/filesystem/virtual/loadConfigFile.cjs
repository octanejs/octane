let jiti = require("jiti");
//#region src/filesystem/virtual/loadConfigFile.ts
async function loadConfigFile(filePath) {
	return await (0, jiti.createJiti)(filePath, {
		interopDefault: false,
		tsconfigPaths: true
	}).import(filePath);
}
//#endregion
exports.loadConfigFile = loadConfigFile;

//# sourceMappingURL=loadConfigFile.cjs.map