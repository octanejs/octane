// The website's curated view of the binding inventory. The status generator
// verifies every package with a status.json appears exactly once here, so this
// editorial grouping and every count derived from it stay in sync with the repo.
import bindingCategories from './bindings.json';

export interface BindingCatalogEntry {
	packageName: string;
	title: string;
	searchTerms?: readonly string[];
	tags: readonly string[];
}

export interface BindingCategory {
	title: string;
	description: string;
	packages: BindingCatalogEntry[];
}

export const BINDING_CATEGORIES = bindingCategories satisfies BindingCategory[];

export const BINDING_COUNT = BINDING_CATEGORIES.reduce(
	(total, category) => total + category.packages.length,
	0,
);
