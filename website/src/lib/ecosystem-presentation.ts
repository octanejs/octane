import type { EcosystemEntity } from './ecosystem-search-core.ts';

export function ecosystemPackageGuideHref(packageName: string): string {
	return (
		'https://github.com/octanejs/octane/tree/main/packages/' +
		packageName.slice('@octanejs/'.length)
	);
}

export function ecosystemEntityTypeLabel(entity: EcosystemEntity): string {
	return entity.kind === 'library-binding' ? 'Library binding' : 'Framework integration';
}
