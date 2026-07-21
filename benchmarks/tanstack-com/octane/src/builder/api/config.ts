import { normalizeFrameworkId, type FrameworkId } from '../frameworks';
import { create } from './create-worker';

export { type FrameworkId, FRAMEWORKS, normalizeFrameworkId } from '../frameworks';

export async function getFramework(id: FrameworkId | string = 'react') {
	const frameworkId = normalizeFrameworkId(id);
	const framework = await create.getFrameworkById(frameworkId);
	if (!framework) {
		throw new Error(`${id} framework not found`);
	}
	return framework;
}

export const DEFAULT_MODE = 'file-router';
export const DEFAULT_REQUIRED_ADDONS: Array<string> = [];
