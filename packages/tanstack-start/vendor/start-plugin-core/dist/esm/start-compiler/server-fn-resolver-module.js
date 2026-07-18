//#region src/start-compiler/server-fn-resolver-module.ts
function getResolverManifestEntries(serverFnsById) {
	return Object.entries(serverFnsById).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, fn]) => ({
		id,
		functionName: fn.functionName,
		extractedFilename: fn.extractedFilename,
		isClientReferenced: fn.isClientReferenced ?? true
	}));
}
function getClientReferencedCheck(includeClientReferencedCheck) {
	if (!includeClientReferencedCheck) return "";
	return `
  if (access.origin === 'client' && !serverFnInfo.isClientReferenced) {
    throw new Error('Server function not accessible from client: ' + id)
  }
`;
}
function getResolverBody() {
	return `
export async function getServerFnById(id, access) {
  const serverFnInfo = manifest[id]
  if (!serverFnInfo) {
    throw new Error('Server function info not found for ' + id)
  }
__CLIENT_REFERENCED_CHECK__
  const fnModule = serverFnInfo.module ?? (await serverFnInfo.importer())
  if (!fnModule) {
    throw new Error('Server function module not resolved for ' + id)
  }
  const action = fnModule[serverFnInfo.functionName]
  if (!action) {
    throw new Error('Server function module export not resolved for serverFn ID: ' + id)
  }
  return action
}
`;
}
function getResolverManifestModuleAccess(opts) {
	if (opts.useStaticImports) return `module: ${opts.moduleRef}`;
	return `importer: () => import(${JSON.stringify(opts.extractedFilename)})`;
}
function getResolverManifestEntry(opts) {
	const clientReferenced = opts.includeClientReferencedCheck ? `,\n    isClientReferenced: ${opts.entry.isClientReferenced}` : "";
	return `'${opts.entry.id}': {
    functionName: '${opts.entry.functionName}',
    ${opts.moduleAccess}${clientReferenced}
  }`;
}
function generateServerFnResolverModule(opts) {
	const manifestEntries = getResolverManifestEntries(opts.serverFnsById);
	const staticImports = [];
	const manifest = manifestEntries.map((entry, index) => {
		const moduleRef = `serverFnModule${index}`;
		if (opts.useStaticImports) staticImports.push(`import * as ${moduleRef} from ${JSON.stringify(entry.extractedFilename)}`);
		return getResolverManifestEntry({
			entry,
			moduleAccess: getResolverManifestModuleAccess({
				useStaticImports: opts.useStaticImports,
				extractedFilename: entry.extractedFilename,
				moduleRef
			}),
			includeClientReferencedCheck: opts.includeClientReferencedCheck
		});
	}).join(",\n  ");
	const body = getResolverBody().replace("__CLIENT_REFERENCED_CHECK__", getClientReferencedCheck(opts.includeClientReferencedCheck));
	return `
${staticImports.join("\n")}
const manifest = {
  ${manifest}
}
${body}
`;
}
//#endregion
export { generateServerFnResolverModule };

//# sourceMappingURL=server-fn-resolver-module.js.map