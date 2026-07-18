import { fileURLToPath } from "node:url";
import path from "pathe";
//#region src/plugin/shared.ts
var currentDir = path.dirname(fileURLToPath(import.meta.url));
var defaultEntryDir = path.resolve(currentDir, "..", "..", "plugin", "default-entry");
var octaneStartDefaultEntryPaths = {
	client: path.resolve(defaultEntryDir, "client.ts"),
	server: path.resolve(defaultEntryDir, "server.ts"),
	start: path.resolve(defaultEntryDir, "start.ts")
};
//#endregion
export { octaneStartDefaultEntryPaths };

//# sourceMappingURL=shared.js.map