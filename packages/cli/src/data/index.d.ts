interface Binding {
	name: string;
	version: string;
	category: string;
	upstream: { package: string; version: string } | null;
	surface: string;
	divergences: string[];
	ssr: string;
	verified: string | null;
	/** The package's `exports` subpaths, such as `./shallow`, without the root. */
	exports: string[];
}
export declare const DATA: {
	bindings: Binding[];
	reactPackages: Record<string, string>;
	errorCodes: Record<string, { message: string; runtime: string[]; status: string }>;
	strongDiagnostics: {
		diagnostics: Record<
			string,
			{ severity: string; detects: string; replacement: string; url: string }
		>;
		recipes: { id: string; title: string; react: string; strong: string; codes: string[] }[];
	};
};
export declare const ERROR_DOCS_URL: 'https://octanejs.dev/errors/';
export declare const BINDINGS: Binding[];
export declare function resolveBinding(
	name: string,
): { binding: Binding; via: 'binding' | 'react-package' } | null;
export declare function searchBindings(query: string, options?: { surface?: boolean }): Binding[];
