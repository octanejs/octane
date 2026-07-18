import { VITE_ENVIRONMENT_NAMES } from "../constants.js";
import { join } from "pathe";
//#region src/vite/output-directory.ts
function getClientOutputDirectory(userConfig) {
	return getOutputDirectory(userConfig, VITE_ENVIRONMENT_NAMES.client, "client");
}
function getServerOutputDirectory(userConfig) {
	return getOutputDirectory(userConfig, VITE_ENVIRONMENT_NAMES.server, "server");
}
function getOutputDirectory(userConfig, environmentName, directoryName) {
	const rootOutputDirectory = userConfig.build?.outDir ?? "dist";
	return userConfig.environments?.[environmentName]?.build?.outDir ?? join(rootOutputDirectory, directoryName);
}
//#endregion
export { getClientOutputDirectory, getServerOutputDirectory };

//# sourceMappingURL=output-directory.js.map