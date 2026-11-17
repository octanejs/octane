import { api } from '../../../../../../../shared/api.js';

export const load = ({ params }) => api('project', { org: params.org, project: params.project });
