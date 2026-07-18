import { createIdFilter, resolveViteId } from "../utils.js";
//#region src/vite/createVirtualModule.ts
function createVirtualModule(opts) {
	const resolvedId = resolveViteId(opts.moduleId.replaceAll("#", "%23"));
	return {
		name: opts.name,
		apply: opts.apply,
		applyToEnvironment: opts.applyToEnvironment,
		enforce: opts.enforce,
		sharedDuringBuild: opts.sharedDuringBuild,
		resolveId: {
			filter: { id: createIdFilter([opts.moduleId]) },
			handler(id) {
				if (id === opts.moduleId) return resolvedId;
			}
		},
		load: {
			filter: { id: createIdFilter([resolvedId]) },
			handler(id) {
				if (id !== resolvedId) return;
				return opts.load.call(this, id);
			}
		}
	};
}
//#endregion
export { createVirtualModule };

//# sourceMappingURL=createVirtualModule.js.map