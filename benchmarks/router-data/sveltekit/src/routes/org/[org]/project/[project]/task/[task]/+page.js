import { api } from '../../../../../../../../../shared/api.js';

export const load = ({ params, depends }) => {
	depends(`task:${params.task}`);
	return api('task', { task: params.task });
};
