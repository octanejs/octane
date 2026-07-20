import { createServerFn } from '@tanstack/react-start';
import * as v from 'valibot';
import { invalidateDocsCacheAdmin, listDocsCacheReposAdmin } from './docs-admin.server';

export const listDocsCacheRepos = createServerFn({ method: 'GET' }).handler(async () =>
	listDocsCacheReposAdmin(),
);

export const invalidateDocsCache = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			repo: v.optional(v.string()),
		}),
	)
	.handler(async ({ data }) => invalidateDocsCacheAdmin({ data }));
