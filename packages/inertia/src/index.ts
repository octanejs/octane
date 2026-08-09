// @octanejs/inertia
//
// The Inertia router, HTTP client, and progress APIs are framework-neutral.
// Keep their upstream identities intact while the renderer-specific adapter is
// implemented in this package.
import { config as coreConfig } from '@inertiajs/core';

export { http, progress, router } from '@inertiajs/core';
export { resetLayoutProps, setLayoutProps } from './layoutProps';
export { default as usePage } from './usePage';
export { default as usePoll } from './usePoll';
export { default as usePrefetch } from './usePrefetch';
export { default as useRemember } from './useRemember';
export {
	type InertiaForm,
	type InertiaFormProps,
	type InertiaPrecognitiveFormProps,
	type SetDataAction,
	type SetDataByKeyValuePair,
	type SetDataByMethod,
	type SetDataByObject,
	default as useForm,
} from './useForm';
export { default as useHttp } from './useHttp';

export const config = coreConfig;
