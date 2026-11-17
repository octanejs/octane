import { api } from '../../../../../shared/api.js';

export const load = ({ params }) => api('org', { org: params.org });
