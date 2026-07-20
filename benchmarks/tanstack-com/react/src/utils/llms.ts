import { setResponseHeader } from '@tanstack/react-start/server';
import { libraries, librariesByGroup, librariesGroupNamesMap } from '~/libraries/libraries';
import type { Framework, LibrarySlim } from '~/libraries/types';
import type { ConfigSchema } from '~/utils/config';
import { partners, partnerCategoryLabels, type Partner } from '~/utils/partners';
import { getPartnerPlacementContext, getPartnersForPlacement } from '~/utils/partner-placement';
import { docsNavTabs, getDocsNavTabId } from './docsNavTabs';

const siteOrigin = 'https://tanstack.com';

const librarySections = [
	{
		label: `${librariesGroupNamesMap.framework} docs`,
		libraries: librariesByGroup.framework,
	},
	{
		label: `${librariesGroupNamesMap.state} docs`,
		libraries: librariesByGroup.state,
	},
	{
		label: `${librariesGroupNamesMap.headlessUI} docs`,
		libraries: librariesByGroup.headlessUI,
	},
	{
		label: `${librariesGroupNamesMap.performance} docs`,
		libraries: librariesByGroup.performance,
	},
	{
		label: `${librariesGroupNamesMap.tooling} docs`,
		libraries: librariesByGroup.tooling,
	},
];

const frameworkLabels: Record<Framework, string> = {
	angular: 'Angular',
	alpine: 'Alpine',
	ember: 'Ember',
	lit: 'Lit',
	marko: 'Marko',
	preact: 'Preact',
	qwik: 'Qwik',
	react: 'React',
	solid: 'Solid',
	svelte: 'Svelte',
	vanilla: 'Vanilla',
	vue: 'Vue',
};

export function setLlmsTxtResponseHeaders() {
	setResponseHeader('Content-Type', 'text/plain; charset=utf-8');
	setResponseHeader('Cache-Control', 'public, max-age=0, must-revalidate');
	setResponseHeader(
		'Cloudflare-CDN-Cache-Control',
		'public, max-age=86400, stale-while-revalidate=86400',
	);
}

export function generateLlmsTxt(): string {
	const lines: Array<string> = [];
	const llmsPlacementContext = getPartnerPlacementContext({
		orderStrategy: 'machine-readable',
		surface: 'llms_txt',
	});
	const activePartners = getPartnersForPlacement(
		partners.filter((partner) => partner.status === 'active'),
		llmsPlacementContext,
	);

	lines.push('# TanStack');
	lines.push('');
	lines.push(
		'> TanStack is a set of open-source TypeScript libraries for routing, async state, server state, tables, forms, virtualization, data stores, full-stack apps, AI SDKs, and developer tooling.',
	);
	lines.push('');
	lines.push(
		'This file routes agents to the smallest useful TanStack docs source. Fetch the linked product docs index first, then follow links from that page when you need deeper context. Root `/llms-full.txt` intentionally returns this same index because the complete TanStack docs corpus is too large for a useful root-level context file.',
	);
	lines.push('');

	for (const section of librarySections) {
		lines.push(`## ${section.label}`);
		lines.push('');

		for (const library of section.libraries) {
			if (!library.to || library.visible === false) continue;

			lines.push(formatLibraryIndexLink(library));
		}

		lines.push('');
	}

	lines.push('## Machine-readable data');
	lines.push('');
	lines.push(
		'- [Libraries JSON](https://tanstack.com/api/data/libraries): Current library metadata including ids, docs URLs, GitHub repositories, framework support, versions, and package names.',
	);
	lines.push(
		'- [NPM Stats](https://tanstack.com/stats/npm): Compare npm package download statistics across TanStack packages and related ecosystem packages.',
	);
	lines.push('');

	lines.push('## Optional');
	lines.push('');
	lines.push(
		'- [Blog](https://tanstack.com/blog): Release notes, postmortems, performance work, and technical writing from the TanStack team.',
	);

	for (const partner of activePartners) {
		lines.push(formatPartnerLink(partner));
	}

	lines.push('');

	return lines.join('\n');
}

function formatLibraryIndexLink(library: LibrarySlim) {
	const details = [
		library.tagline,
		formatFrameworks(library),
		formatPackages(library),
		library.repo ? `GitHub: https://github.com/${library.repo}` : undefined,
	]
		.filter(isPresent)
		.map(stripSentenceEnd);

	return `- [${library.name}](${getLibraryDocsMarkdownUrl(library)}): ${details.join('. ')}.`;
}

function getLibraryDocsMarkdownUrl(library: LibrarySlim) {
	return `${siteOrigin}/${library.id}/latest/llms.txt`;
}

function formatFrameworks(library: LibrarySlim) {
	if (library.frameworks.length === 0) {
		return undefined;
	}

	return `Frameworks: ${library.frameworks
		.map((framework) => frameworkLabels[framework])
		.join(', ')}`;
}

function formatPackages(library: LibrarySlim) {
	const packageNames = Array.from(
		new Set([
			...(library.corePackageName ? [library.corePackageName] : []),
			...(library.npmPackageNames ?? []),
		]),
	);

	if (packageNames.length === 0) {
		return undefined;
	}

	return `Packages: ${packageNames.join(', ')}`;
}

function formatPartnerLink(partner: Partner) {
	return `- [${partner.name}](${partner.href}): ${partnerCategoryLabels[partner.category]}. Works with ${formatPartnerLibraries(partner)}. ${partner.llmDescription}`;
}

function formatPartnerLibraries(partner: Partner) {
	const libraryIds = partner.libraries ?? [];

	if (libraryIds.length === 0) {
		return 'the general TanStack ecosystem';
	}

	const libraryNames = libraryIds
		.map((libraryId) => libraries.find((library) => library.id === libraryId))
		.map((library) => library?.name)
		.filter(isPresent);

	if (libraryNames.length === 0) {
		return 'the general TanStack ecosystem';
	}

	return libraryNames.join(', ');
}

function isPresent<T>(value: T | undefined): value is T {
	return value !== undefined;
}

function stripSentenceEnd(value: string) {
	return value.trim().replace(/[.!?]+$/g, '');
}

type ConfigSection = ConfigSchema['sections'][number];
type ConfigChild = ConfigSection['children'][number];
type ConfigFramework = NonNullable<ConfigSection['frameworks']>[number];

type DocsIndexEntry = {
	child: ConfigChild;
	framework?: string;
	section: ConfigSection;
};

export function generateLibraryDocsIndexMarkdown({
	config,
	library,
	version,
}: {
	config: ConfigSchema;
	library: LibrarySlim;
	version: string;
}) {
	const lines: Array<string> = [];
	const libraryPath = `${siteOrigin}/${library.id}/${version}`;
	const llmsTxtUrl = `${libraryPath}/llms.txt`;
	const docsIndexUrl = `${libraryPath}/docs/index.md`;
	const entries = getDocsIndexEntries(config);

	lines.push(`# ${library.name} docs`);
	lines.push('');
	lines.push(`> ${stripSentenceEnd(library.description ?? library.tagline)}.`);
	lines.push('');
	lines.push(`- [Docs index](${docsIndexUrl}): This same Markdown index.`);
	lines.push(`- [LLMs index](${llmsTxtUrl}): This same Markdown index.`);
	lines.push(`- [Library home](${libraryPath})`);

	if (library.repo) {
		lines.push(`- [GitHub](https://github.com/${library.repo})`);
	}

	const packages = formatPackages(library);

	if (packages) {
		lines.push(`- ${packages}.`);
	}

	const frameworks = formatFrameworks(library);

	if (frameworks) {
		lines.push(`- ${frameworks}.`);
	}

	lines.push('');
	lines.push(
		'Use this index as the routing layer for the docs. Fetch one linked Markdown page at a time, and prefer framework-specific pages when the user names a framework.',
	);
	lines.push('');

	for (const tab of docsNavTabs) {
		const tabEntries = entries.filter((entry) => {
			return getDocsNavTabId(entry.section, entry.child) === tab.id;
		});

		if (tabEntries.length === 0) {
			continue;
		}

		lines.push(`## ${tab.label}`);
		lines.push('');

		let currentSectionLabel: string | undefined;

		for (const entry of tabEntries) {
			if (entry.section.label !== currentSectionLabel) {
				currentSectionLabel = entry.section.label;
				lines.push(`### ${currentSectionLabel}`);
				lines.push('');
			}

			lines.push(formatDocsIndexEntry({ entry, library, version }));
		}

		lines.push('');
	}

	return lines.join('\n');
}

function getDocsIndexEntries(config: ConfigSchema) {
	return config.sections.flatMap((section) => [
		...section.children.map(
			(child): DocsIndexEntry => ({
				child,
				section,
			}),
		),
		...(section.frameworks ?? []).flatMap((framework) =>
			getFrameworkDocsIndexEntries({ framework, section }),
		),
	]);
}

function getFrameworkDocsIndexEntries({
	framework,
	section,
}: {
	framework: ConfigFramework;
	section: ConfigSection;
}) {
	return framework.children.map(
		(child): DocsIndexEntry => ({
			child,
			framework: framework.label,
			section,
		}),
	);
}

function formatDocsIndexEntry({
	entry,
	library,
	version,
}: {
	entry: DocsIndexEntry;
	library: LibrarySlim;
	version: string;
}) {
	const label = entry.framework
		? `${formatFrameworkLabel(entry.framework)}: ${entry.child.label}`
		: entry.child.label;
	const href = getDocsIndexEntryHref({
		library,
		target: entry.child.to,
		version,
	});
	const metadata = [
		entry.child.badge,
		entry.child.addedAt ? `added ${entry.child.addedAt}` : undefined,
		entry.child.updatedAt ? `updated ${entry.child.updatedAt}` : undefined,
	].filter(isPresent);
	const suffix = metadata.length ? ` (${metadata.join(', ')})` : '';

	return `- [${label}](${href})${suffix}`;
}

function getDocsIndexEntryHref({
	library,
	target,
	version,
}: {
	library: LibrarySlim;
	target: string;
	version: string;
}) {
	if (target.startsWith('http')) {
		return target;
	}

	if (target === '..') {
		return `${siteOrigin}/${library.id}/${version}`;
	}

	if (target === './framework') {
		return `${siteOrigin}/${library.id}/${version}/docs/framework`;
	}

	const resolvedTarget = target
		.replaceAll('$libraryId', library.id)
		.replaceAll('$version', version);

	if (resolvedTarget.startsWith('/')) {
		return appendMarkdownExtension(`${siteOrigin}${resolvedTarget}`);
	}

	const relativeTarget = resolvedTarget.replace(/^\.\//, '');

	return appendMarkdownExtension(`${siteOrigin}/${library.id}/${version}/docs/${relativeTarget}`);
}

function appendMarkdownExtension(href: string) {
	const hashIndex = href.indexOf('#');
	const beforeHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
	const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
	const queryIndex = beforeHash.indexOf('?');
	const path = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
	const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex);

	if (!path.includes('/docs/') || path.endsWith('.md') || path.endsWith('/')) {
		return href;
	}

	return `${path}.md${query}${hash}`;
}

function formatFrameworkLabel(framework: string) {
	const normalizedFramework = framework.toLowerCase();

	if (isFramework(normalizedFramework)) {
		return frameworkLabels[normalizedFramework];
	}

	return normalizedFramework;
}

function isFramework(value: string): value is Framework {
	return Object.hasOwn(frameworkLabels, value);
}
