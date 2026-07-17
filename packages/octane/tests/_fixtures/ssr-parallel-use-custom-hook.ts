import { use } from 'octane';

// A plain-TypeScript custom hook mirrors the common split where data access
// lives outside the component module. Its two reads are independent and should
// enter the same Suspense discovery round when consumed by a TSRX component.
export function useSsrResourcePair(load, version) {
	const project = use(load('project', version));
	const viewer = use(load('viewer', version));
	return { project, viewer };
}
