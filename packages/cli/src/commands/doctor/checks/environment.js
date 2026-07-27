import { fail, pass, warn } from '../check.js';

const MINIMUM_NODE_MAJOR = 22;

/** @type {import('../check.js').Check[]} */
export const environmentChecks = [
	{
		id: 'env.node-version',
		title: 'Node.js version',
		category: 'environment',
		severity: 'error',
		run(ctx) {
			const version = ctx.env.OCTANE_DOCTOR_NODE ?? process.versions.node;
			const major = Number(version.split('.')[0]);
			return major >= MINIMUM_NODE_MAJOR
				? pass(`Node ${version}`)
				: fail(`Node ${version} is below the supported baseline`, {
						detail: [
							`Every published Octane package declares "engines": { "node": ">=${MINIMUM_NODE_MAJOR}" }.`,
						],
					});
		},
	},
	{
		id: 'env.package-manager',
		title: 'Package manager',
		category: 'environment',
		severity: 'warning',
		run(ctx, project) {
			if (!project.packageManager) {
				return warn('No lockfile found', {
					detail: ['Install dependencies so the doctor can inspect the resolved tree.'],
				});
			}
			return pass(`${project.packageManager}${project.lockfile ? ` (${project.lockfile})` : ''}`);
		},
	},
];
