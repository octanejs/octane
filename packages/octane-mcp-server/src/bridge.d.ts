type Status = 'same' | 'rewrite' | 'partial' | 'unsupported';
interface Api {
	status: Status;
	note: string;
	strong?: string;
}
interface PackageJson {
	version?: string;
	exports?: unknown;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	[key: string]: unknown;
}
interface Scan {
	apis: Map<string, number>;
	imports: Set<string>;
	classComponent: boolean;
	symbolExports: Map<string, number>;
}
interface Report {
	target: string;
	existingBinding: string | null;
	vanillaCore?: string | null;
	apis: (Api & { name: string; count: number })[];
	reactImports: string[];
	classComponents: boolean;
	verdict: 'needs-rework' | 'bridgeable-with-rewrites' | 'bridgeable';
	plan: string[];
}
export declare const KNOWN_BINDINGS: Record<string, string>;
export declare const UPSTREAM_ADAPTERS: Record<string, string>;
export declare const KNOWN_NATIVE_BINDINGS: Set<string>;
export declare const KNOWN_BINDING_PACKAGE_DIRS: Set<string>;
export declare const KNOWN_VANILLA_CORES: Record<string, string | null>;
export declare const REACT_API_MAP: Record<string, Api>;
export declare function collectSourceFiles(
	root: string,
	out?: string[],
	depth?: number,
): Promise<string[]>;
export declare function scanSource(source: string): Scan;
export declare function scanPath(root: string): Promise<{
	filesScanned: number;
	totals: Map<string, number>;
	imports: Set<string>;
	classComponents: boolean;
	symbolExports: Map<string, number>;
}>;
export declare function readPackageJson(dir: string): Promise<PackageJson | null>;
export declare function detectVanillaCore(
	packageName: string,
	packageJson: PackageJson | null,
): string | null;
export declare function bridgeReport(
	input: ({ packageName: string; path?: string } | { packageName?: string; path: string }) & {
		projectRoot?: string;
	},
): Promise<
	| (Report & { filesScanned: number; version?: string | null; peerDependsOnReact?: boolean })
	| { target: string; existingBinding: string | null; error: string }
>;
export declare function bridgeReportFromSource(
	source: string,
	options?: { packageName?: string },
): Report;
