import { use } from 'octane';
import { loadResource } from '../data.js';

// A normal separate-file custom hook, matching how React data hooks are
// commonly authored. Both reads are independent, even though one is written
// after the other.
export function useProjectBundle(version: number) {
	const project = use(loadResource('project', version));
	const viewer = use(loadResource('viewer', version));
	return { project, viewer };
}
