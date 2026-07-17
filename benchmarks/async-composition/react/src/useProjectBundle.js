import { use } from 'react';
import { loadResource } from '../../shared/data.js';

export function useProjectBundle(version) {
	const project = use(loadResource('project', version));
	const viewer = use(loadResource('viewer', version));
	return { project, viewer };
}
