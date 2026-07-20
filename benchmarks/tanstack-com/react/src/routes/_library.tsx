import { Outlet, createFileRoute, notFound, useMatches } from '@tanstack/react-router';
import { LibraryLayout } from '~/components/LibraryLayout';
import { findLibrary } from '~/libraries';
import type { LibraryId } from '~/libraries';
import type { ConfigSchema } from '~/utils/config';

const emptyConfig: ConfigSchema = { sections: [] };

export const Route = createFileRoute('/_library')({
	component: LibraryRoute,
});

function LibraryRoute() {
	const layoutData = useMatches({
		select: (matches) => {
			const config = matches
				.map((match) => getConfigFromLoaderData(match.loaderData))
				.find(isDefined);
			const version = matches.map((match) => getVersionFromParams(match.params)).find(isDefined);
			const libraryId =
				matches.map((match) => getLibraryIdFromParams(match.params)).find(isDefined) ??
				getLibraryIdFromPathname(matches[matches.length - 1]?.pathname);

			return {
				config,
				isLandingPage: !matches.some((match) => match.pathname.includes('/docs')),
				libraryId,
				version,
			};
		},
	});

	const library = layoutData.libraryId ? findLibrary(layoutData.libraryId) : undefined;

	if (!library || !layoutData.version) {
		throw notFound();
	}

	const config = layoutData.config ?? emptyConfig;

	return (
		<LibraryLayout
			libraryId={library.id}
			name={library.name.replace('TanStack ', '')}
			version={layoutData.version === 'latest' ? library.latestVersion : layoutData.version}
			colorFrom={library.accentColorFrom ?? library.colorFrom}
			colorTo={library.accentColorTo ?? library.colorTo}
			textColor={library.accentTextColor ?? library.textColor ?? ''}
			config={config}
			frameworks={library.frameworks}
			versions={library.availableVersions}
			repo={library.repo}
			isLandingPage={layoutData.isLandingPage}
		>
			<Outlet />
		</LibraryLayout>
	);
}

function getLibraryIdFromParams(params: unknown): LibraryId | undefined {
	if (typeof params !== 'object' || params === null || !('libraryId' in params)) {
		return undefined;
	}

	const libraryId = params.libraryId;

	if (typeof libraryId !== 'string') {
		return undefined;
	}

	return findLibrary(libraryId)?.id;
}

function getLibraryIdFromPathname(pathname: string | undefined): LibraryId | undefined {
	const firstSegment = pathname?.split('/').filter(Boolean)[0];
	const library = firstSegment ? findLibrary(firstSegment) : undefined;

	return library?.id;
}

function getConfigFromLoaderData(loaderData: unknown): ConfigSchema | undefined {
	return typeof loaderData === 'object' &&
		loaderData !== null &&
		'config' in loaderData &&
		isConfigSchema(loaderData.config)
		? loaderData.config
		: undefined;
}

function getVersionFromParams(params: unknown): string | undefined {
	return typeof params === 'object' &&
		params !== null &&
		'version' in params &&
		typeof params.version === 'string'
		? params.version
		: undefined;
}

function isConfigSchema(config: unknown): config is ConfigSchema {
	return (
		typeof config === 'object' &&
		config !== null &&
		'sections' in config &&
		Array.isArray(config.sections)
	);
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
