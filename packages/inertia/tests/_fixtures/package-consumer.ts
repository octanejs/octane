import { http, progress, router } from '@inertiajs/core';
import * as inertia from '@octanejs/inertia';

export function run() {
	return {
		exports: Object.keys(inertia).sort(),
		http: inertia.http === http,
		progress: inertia.progress === progress,
		router: inertia.router === router,
	};
}
