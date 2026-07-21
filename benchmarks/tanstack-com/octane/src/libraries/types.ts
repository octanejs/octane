import type { ReactNode } from 'octane';
import type { LibraryId } from './ids';

export type { LibraryId } from './ids';

export type Framework =
	| 'angular'
	| 'alpine'
	| 'ember'
	| 'lit'
	| 'marko'
	| 'preact'
	| 'qwik'
	| 'react'
	| 'solid'
	| 'svelte'
	| 'vanilla'
	| 'vue';

// Base library type - used for navigation, docs, and most UI
export type LibrarySlim = {
	id: LibraryId;
	name: string;
	to?: string;
	tagline: string;
	description?: string;
	cardStyles: string;
	bgStyle: string;
	borderStyle: string;
	textStyle: string;
	textColor?: string;
	colorFrom: string;
	colorTo: string;
	// Accent colors for docs UI (sidebar, TOC, prev/next) - defaults to colorFrom/colorTo if not set
	accentColorFrom?: string;
	accentColorTo?: string;
	accentTextColor?: string;
	badgeTextStyle?: string;
	bgRadial?: string;
	badge?: 'new' | 'soon' | 'alpha' | 'beta' | 'fresh' | 'RC';
	repo: string;
	frameworks: Framework[];
	latestVersion: string;
	latestBranch?: string;
	availableVersions: string[];
	scarfId?: string;
	defaultDocs?: string;
	docsRoot?: string;
	hideCodesandboxUrl?: true;
	hideStackblitzUrl?: true;
	showVercelUrl?: boolean;
	showNetlifyUrl?: boolean;
	showCloudflareUrl?: boolean;
	showRailwayUrl?: boolean;
	embedEditor?: 'codesandbox' | 'stackblitz';
	legacyPackages?: string[];
	npmPackageNames?: string[];
	installPath?: string;
	corePackageName?: string;
	frameworkPackageNames?: Partial<Record<Framework, string>>;
	frameworkDocs?: Partial<Record<Framework, string>>;
	handleRedirects?: (href: string) => void;
	/**
	 * If false, the library is hidden from sidebar navigation and pages have noindex meta tag.
	 * Use for alpha/private libraries not ready for public visibility.
	 * Defaults to true.
	 */
	visible?: boolean;
	sitemap?: {
		includeLandingPage?: boolean;
		includeDocsPages?: boolean;
	};
};

// Extended library type - adds React node content for landing pages
// This is code-split with the library landing pages
export type Library = LibrarySlim & {
	featureHighlights?: {
		title: string;
		icon: ReactNode;
		description: ReactNode;
	}[];
	testimonials?: Testimonial[];
};

export type Testimonial = {
	quote: string;
	author: string;
	role: string;
	company: string;
	avatar?: string;
};
