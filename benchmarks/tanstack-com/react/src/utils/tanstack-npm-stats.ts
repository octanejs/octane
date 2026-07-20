export const tanStackTotalNpmStatsPackageGroup = {
	label: 'TanStack',
	packages: [
		{ name: '@tanstack/query-core' },
		{ name: 'react-query' },
		{ name: '@tanstack/table-core' },
		{ name: 'react-table' },
		{ name: '@tanstack/router-core' },
		{ name: 'react-location' },
		{ name: '@tanstack/start-client-core' },
		{ name: '@tanstack/form-core' },
		{ name: '@tanstack/virtual-core' },
		{ name: 'react-virtual' },
		{ name: '@tanstack/db' },
		{ name: '@tanstack/pacer' },
		{ name: '@tanstack/pacer-lite' },
		{ name: '@tanstack/ai' },
		{ name: '@tanstack/intent' },
		{ name: '@tanstack/store', hidden: true },
		{ name: '@tanstack/hotkeys' },
		{ name: '@tanstack/ranger' },
		{ name: 'react-ranger' },
		{ name: '@tanstack/config' },
		{ name: '@tanstack/devtools' },
		{ name: '@tanstack/cli' },
	],
	color: '#01a7b9',
};

export const tanStackTotalNpmStatsSearch = {
	packageGroups: [tanStackTotalNpmStatsPackageGroup],
	bucketOffset: 0,
};

export const tanStackTotalVisibleNpmPackageNames = tanStackTotalNpmStatsPackageGroup.packages
	.filter((pkg) => !pkg.hidden)
	.map((pkg) => pkg.name);

export const tanStackTotalNpmStatsLibrary = {
	id: 'tanstack-total',
	npmPackageNames: tanStackTotalVisibleNpmPackageNames,
	repo: '',
};
