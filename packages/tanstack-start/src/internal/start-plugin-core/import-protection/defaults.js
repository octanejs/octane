import { startFrameworks } from '../types.js';
import { getStartPackage } from '#tanstack-start/package-names';
//#region src/import-protection/defaults.ts
/**
 * Returns the default import protection rules.
 *
 * All framework variants are always included so that, e.g., a React
 * project also denies `@tanstack/solid-start/server` imports.
 */
function getDefaultImportProtectionRules() {
	return {
		client: {
			specifiers: startFrameworks.map((fw) => `${getStartPackage(fw)}/server`),
			files: ['**/*.server.*'],
			excludeFiles: ['**/node_modules/**'],
		},
		server: {
			specifiers: [],
			files: ['**/*.client.*'],
			excludeFiles: ['**/node_modules/**'],
		},
	};
}
/**
 * Marker module specifiers that restrict a file to a specific environment.
 */
function getMarkerSpecifiers() {
	return {
		serverOnly: startFrameworks.map((fw) => `${getStartPackage(fw)}/server-only`),
		clientOnly: startFrameworks.map((fw) => `${getStartPackage(fw)}/client-only`),
	};
}
//#endregion
export { getDefaultImportProtectionRules, getMarkerSpecifiers };
