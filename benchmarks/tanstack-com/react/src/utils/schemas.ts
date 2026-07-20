/**
 * Shared Valibot schemas for validation
 * Uses constants from db/types.ts as single source of truth
 */
import * as v from 'valibot';
import {
	CAPABILITIES,
	OAUTH_PROVIDERS,
	DOC_FEEDBACK_TYPES,
	DOC_FEEDBACK_STATUSES,
	SHOWCASE_STATUSES,
	SHOWCASE_USE_CASES,
	AUDIT_ACTIONS,
	RELEASE_LEVELS,
} from '~/db/types';
import { libraryIds } from '~/libraries/ids';

// Valibot schemas derived from constants
export const capabilitySchema = v.picklist([...CAPABILITIES]);
export const oauthProviderSchema = v.picklist([...OAUTH_PROVIDERS]);
export const docFeedbackTypeSchema = v.picklist([...DOC_FEEDBACK_TYPES]);
export const docFeedbackStatusSchema = v.picklist([...DOC_FEEDBACK_STATUSES]);
export const showcaseStatusSchema = v.picklist([...SHOWCASE_STATUSES]);
export const showcaseUseCaseSchema = v.picklist([...SHOWCASE_USE_CASES]);
export const auditActionSchema = v.picklist([...AUDIT_ACTIONS]);
export const releaseLevelSchema = v.picklist([...RELEASE_LEVELS]);

// Library ID schema - derived from libraries config
export const libraryIdSchema = v.picklist([...libraryIds]);

const npmPackageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

export const npmPackageNameSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.maxLength(214),
	v.regex(npmPackageNamePattern, 'Invalid npm package name'),
);

export function isNpmPackageName(value: string) {
	return value.length <= 214 && npmPackageNamePattern.test(value);
}

export const pageIndexSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000));

export const pageNumberSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000));

export const pageSizeSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100));

export const isoDateSchema = v.pipe(v.string(), v.isoDate());

export const chartHeightSchema = v.pipe(v.number(), v.integer(), v.minValue(240), v.maxValue(1200));

export const chartWidthSchema = v.pipe(v.number(), v.integer(), v.minValue(320), v.maxValue(2400));
