import { createServerFn } from '@tanstack/react-start';
import * as v from 'valibot';
import {
	deleteIntentPackage as deleteIntentPackageServer,
	discoverViaGitHub as discoverViaGitHubServer,
	getIntentAdminStats as getIntentAdminStatsServer,
	getIntentWorkflowHealth as getIntentWorkflowHealthServer,
	listFailedVersions as listFailedVersionsServer,
	listIntentPackages as listIntentPackagesServer,
	listIntentWorkflowRuns as listIntentWorkflowRunsServer,
	repairIntentWorkflowStore as repairIntentWorkflowStoreServer,
	resetFailedVersions as resetFailedVersionsServer,
	retryIntentVersion as retryIntentVersionServer,
	seedIntentPackage as seedIntentPackageServer,
	triggerIntentDiscover as triggerIntentDiscoverServer,
	triggerIntentProcess as triggerIntentProcessServer,
} from '~/utils/intent-admin.server';

export const getIntentAdminStats = createServerFn({ method: 'GET' }).handler(async () =>
	getIntentAdminStatsServer(),
);

export const listIntentPackages = createServerFn({ method: 'GET' }).handler(async () =>
	listIntentPackagesServer(),
);

export const listFailedVersions = createServerFn({ method: 'GET' }).handler(async () =>
	listFailedVersionsServer(),
);

export const listIntentWorkflowRuns = createServerFn({ method: 'GET' }).handler(async () =>
	listIntentWorkflowRunsServer(),
);

export const getIntentWorkflowHealth = createServerFn({
	method: 'GET',
}).handler(async () => getIntentWorkflowHealthServer());

export const repairIntentWorkflowStore = createServerFn({
	method: 'POST',
}).handler(async () => repairIntentWorkflowStoreServer());

export const triggerIntentDiscover = createServerFn({ method: 'POST' }).handler(async () =>
	triggerIntentDiscoverServer(),
);

export const triggerIntentProcess = createServerFn({ method: 'POST' }).handler(async () =>
	triggerIntentProcessServer(),
);

export const retryIntentVersion = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			versionId: v.number(),
		}),
	)
	.handler(async ({ data }) => retryIntentVersionServer({ data }));

export const deleteIntentPackage = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			name: v.string(),
		}),
	)
	.handler(async ({ data }) => deleteIntentPackageServer({ data }));

export const resetFailedVersions = createServerFn({ method: 'POST' }).handler(async () =>
	resetFailedVersionsServer(),
);

export const seedIntentPackage = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			name: v.string(),
		}),
	)
	.handler(async ({ data }) => seedIntentPackageServer({ data }));

export const discoverViaGitHub = createServerFn({ method: 'POST' }).handler(async () =>
	discoverViaGitHubServer(),
);
