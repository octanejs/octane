//#region src/validate-route-params.ts
/**
* Regex for valid JavaScript identifier (param name)
* Must start with letter, underscore, or dollar sign
* Can contain letters, numbers, underscores, or dollar signs
*/
var VALID_PARAM_NAME_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
/**
* Extracts param names from a route path segment.
*
* Handles these patterns:
* - $paramName                     -> extract "paramName"
* - {$paramName}                   -> extract "paramName"
* - prefix{$paramName}suffix       -> extract "paramName"
* - {-$paramName}                  -> extract "paramName" (optional)
* - prefix{-$paramName}suffix      -> extract "paramName" (optional)
* - $ or {$}                       -> wildcard, skip validation
*/
function extractParamsFromSegment(segment) {
	const params = [];
	if (!segment || !segment.includes("$")) return params;
	if (segment === "$" || segment === "{$}") return params;
	if (segment.startsWith("$") && !segment.includes("{")) {
		const paramName = segment.slice(1);
		if (paramName) params.push({
			paramName,
			isValid: VALID_PARAM_NAME_REGEX.test(paramName)
		});
		return params;
	}
	const bracePattern = /\{(-?\$)([^}]*)\}/g;
	let match;
	while ((match = bracePattern.exec(segment)) !== null) {
		const paramName = match[2];
		if (!paramName) continue;
		params.push({
			paramName,
			isValid: VALID_PARAM_NAME_REGEX.test(paramName)
		});
	}
	return params;
}
/**
* Extracts all params from a route path.
*
* @param path - The route path (e.g., "/users/$userId/posts/$postId")
* @returns Array of extracted params with validation info
*/
function extractParamsFromPath(path) {
	if (!path || !path.includes("$")) return [];
	const segments = path.split("/");
	const allParams = [];
	for (const segment of segments) {
		const params = extractParamsFromSegment(segment);
		allParams.push(...params);
	}
	return allParams;
}
/**
* Validates route params and logs warnings for invalid param names.
*
* @param routePath - The route path to validate
* @param filePath - The file path for error messages
* @param logger - Logger instance for warnings
*/
function validateRouteParams(routePath, filePath, logger) {
	const invalidParams = extractParamsFromPath(routePath).filter((p) => !p.isValid);
	for (const param of invalidParams) logger.warn(`WARNING: Invalid param name "${param.paramName}" in route "${routePath}" (file: ${filePath}). Param names must be valid JavaScript identifiers (match /[a-zA-Z_$][a-zA-Z0-9_$]*/).`);
}
//#endregion
exports.validateRouteParams = validateRouteParams;

//# sourceMappingURL=validate-route-params.cjs.map