// The bindings knowledge, snapshotted at build time: the curated catalog the
// website ships, every package's machine-readable status.json, and the
// React-package → binding map maintained in @octanejs/mcp-server.
import categories from '../../../website/src/content/bindings.json';
import { KNOWN_BINDINGS } from '@octanejs/mcp-server/bridge';

export interface BindingCategory {
	title: string;
	description: string;
	packages: string[];
}

export interface BindingStatus {
	/** Full npm name, e.g. '@octanejs/zustand'. */
	package: string;
	/** Workspace directory under packages/. */
	dir: string;
	upstream: { package: string; version: string };
	surface: string;
	divergences: string[];
	ssr: string;
	verified: string;
	notes?: string[];
	docs?: string[];
}

export const BINDING_CATEGORIES = categories as BindingCategory[];

export { KNOWN_BINDINGS };

const statusModules = import.meta.glob('../../../packages/*/status.json', {
	eager: true,
	import: 'default',
}) as Record<string, Omit<BindingStatus, 'package' | 'dir'>>;

export const BINDING_STATUSES: readonly BindingStatus[] = Object.entries(statusModules)
	.map(([path, status]) => {
		const dir = path.split('/').at(-2)!;
		return { package: `@octanejs/${dir}`, dir, ...status };
	})
	.sort((a, b) => a.package.localeCompare(b.package));

/**
 * Resolve a user-supplied name to a binding status: the binding's npm name
 * ('@octanejs/zustand'), its workspace directory ('zustand'), or the React
 * package it ports ('@tanstack/react-query').
 */
export function resolveBinding(name: string): BindingStatus | undefined {
	const viaReact = KNOWN_BINDINGS[name];
	return BINDING_STATUSES.find(
		(status) => status.package === name || status.dir === name || status.package === viaReact,
	);
}
