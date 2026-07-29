import { createContext, useContext, type ComponentBody, type OctaneNode } from 'octane';
import { Link as RouterLink, type Location } from '@octanejs/remix-router';
import { Head, Seo } from '@octanejs/seo';
import { useDocusaurusManifest } from './client-components.tsrx';

type NavigationItem = {
	label: string;
	href?: string;
	to?: string;
	position?: 'left' | 'right';
};

type NavbarConfig = {
	title?: string;
	logo?: {
		alt?: string;
		href?: string;
		src: string;
	};
	items?: NavigationItem[];
};

type FooterItem = {
	label: string;
	href?: string;
	to?: string;
};

type FooterConfig = {
	copyright?: string;
	links?: Array<{
		title: string;
		items: FooterItem[];
	}>;
};

type ClassicThemeConfig = {
	navbar?: NavbarConfig;
	footer?: FooterConfig;
};

type SidebarItem = {
	type: string;
	label: string;
	href?: string;
	key?: string;
	items?: SidebarItem[];
};

type DocLink = {
	title: string;
	permalink: string;
	description?: string;
};

type DocsVersion = {
	label: string;
	noIndex?: boolean;
	docsSidebars: Record<string, SidebarItem[]>;
};

type DocMetadata = {
	title?: string;
	description?: string;
	permalink?: string;
	previous?: DocLink;
	next?: DocLink;
};

type DocContent =
	ComponentBody<Record<string, unknown>> & {
		contentTitle?: string;
		frontMatter?: {
			title?: string;
			description?: string;
			noIndex?: boolean;
		};
		metadata?: DocMetadata;
	};

type RouteProps = {
	attributes?: Record<string, unknown>;
	routes?: RouteProps[];
	path?: string;
};

const VersionContext = createContext<DocsVersion | null>(null);

function isExternal(href: string): boolean {
	return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);
}

function resolvedHref(item: { href?: string; to?: string }): string | null {
	return item.to ?? item.href ?? null;
}

function withBaseUrl(baseUrl: string, href: string): string {
	if (href === '' || isExternal(href) || href.startsWith('#')) return href;
	if (href === baseUrl.replace(/\/$/, '')) return baseUrl;
	if (href.startsWith(baseUrl)) return href;
	return `${baseUrl}${href.replace(/^(?:\.\/|\/)/, '')}`;
}

function absoluteUrl(siteUrl: string, href: string): string {
	try {
		return new URL(href, siteUrl).href;
	} catch {
		return href;
	}
}

function sidebarKey(item: SidebarItem): string {
	return item.key ?? item.href ?? `${item.type}:${item.label}`;
}

function navigationKey(item: NavigationItem | FooterItem): string {
	return resolvedHref(item) ?? item.label;
}

function findSidebarCategory(items: SidebarItem[], href: string): SidebarItem | null {
	for (const item of items) {
		if (item.type !== 'category') continue;
		if (item.href === href) return item;
		const nested = findSidebarCategory(item.items ?? [], href);
		if (nested !== null) return nested;
	}
	return null;
}

function categoryItems(version: DocsVersion, href: string): DocLink[] {
	for (const sidebar of Object.values(version.docsSidebars)) {
		const category = findSidebarCategory(sidebar, href);
		if (category === null) continue;
		return (category.items ?? []).flatMap(
			(item) => item.href === undefined
				? []
				: [
						{
							title: item.label,
							permalink: item.href,
						},
					],
		);
	}
	return [];
}

function useDocsVersion(): DocsVersion {
	const version = useContext(VersionContext);
	if (version === null) {
		throw new Error('[@octanejs/docusaurus] The classic DocRoot requires DocVersionRoot.');
	}
	return version;
}

function ThemeLink(props: {
	href: string;
	class?: string;
	'aria-current'?: 'page';
	children?: OctaneNode;
}) @{
	@if (isExternal(props.href)) {
		<a
			href={props.href}
			class={props.class}
			aria-current={props['aria-current']}
		>{props.children}</a>
	} @else {
		<RouterLink
			to={props.href}
			class={props.class}
			aria-current={props['aria-current']}
		>{props.children}</RouterLink>
	}
}

function Navbar(props: { config?: NavbarConfig }) @{
	const manifest = useDocusaurusManifest();
	const title = props.config?.title ?? manifest.site.title;
	const brandHref = withBaseUrl(manifest.baseUrl, props.config?.logo?.href ?? manifest.baseUrl);
	const items = props.config?.items ?? [];

	<header class="octane-docs-navbar">
		<ThemeLink href={brandHref} class="octane-docs-navbar__brand">
			@if (props.config?.logo !== undefined) {
				<img
					src={withBaseUrl(manifest.baseUrl, props.config.logo.src)}
					alt={props.config.logo.alt ?? title}
				/>
			}
			<span>{title}</span>
		</ThemeLink>
		@if (items.length > 0) {
			<nav aria-label="Primary">
				<ul class="octane-docs-navbar__items">
					@for (const item of items; key navigationKey(item)) {
						@if (resolvedHref(item) !== null) {
							<li>
								<ThemeLink
									href={withBaseUrl(manifest.baseUrl, resolvedHref(item)!)}
								>{item.label}</ThemeLink>
							</li>
						}
					}
				</ul>
			</nav>
		}
	</header>
}

function Footer(props: { baseUrl: string; config?: FooterConfig }) @{
	const groups = props.config?.links ?? [];
	// Docusaurus treats the developer-provided copyright as trusted site HTML.
	const copyright = props.config?.copyright;

	@if (groups.length > 0 || copyright !== undefined) {
		<footer class="octane-docs-footer">
			@if (groups.length > 0) {
				<ul class="octane-docs-footer__links">
					@for (const group of groups; key group.title) {
						<li>
							<strong>{group.title}</strong>
							<ul class="octane-docs-footer__items">
								@for (const item of group.items; key navigationKey(item)) {
									@if (resolvedHref(item) !== null) {
										<li>
											<ThemeLink
												href={withBaseUrl(props.baseUrl, resolvedHref(item)!)}
											>{item.label}</ThemeLink>
										</li>
									}
								}
							</ul>
						</li>
					}
				</ul>
			}
			@if (copyright !== undefined) {
				<div
					class="octane-docs-footer__copyright"
					dangerouslySetInnerHTML={{ __html: copyright }}
				/>
			}
		</footer>
	}
}

function SidebarItems(props: { items: SidebarItem[]; pathname: string }) @{
	<ul>
		@for (const item of props.items; key sidebarKey(item)) {
			<li>
				@if (item.type === 'category' && item.items !== undefined) {
					<>
						@if (item.href !== undefined) {
							<ThemeLink
								href={item.href}
								class="octane-docs-sidebar__category"
								aria-current={item.href === props.pathname ? 'page' : undefined}
							>{item.label}</ThemeLink>
						} @else {
							<span class="octane-docs-sidebar__category">{item.label}</span>
						}
						<SidebarItems items={item.items} pathname={props.pathname} />
					</>
				} @else if (item.href !== undefined) {
					<ThemeLink
						href={item.href}
						aria-current={item.href === props.pathname ? 'page' : undefined}
					>{item.label}</ThemeLink>
				} @else {
					<span>{item.label}</span>
				}
			</li>
		}
	</ul>
}

function PageMetadata(props: {
	title?: string;
	description?: string;
	permalink?: string;
	noIndex?: boolean;
}) @{
	const manifest = useDocusaurusManifest();
	const title =
		props.title === undefined || props.title === manifest.site.title
			? manifest.site.title
			: `${props.title} | ${manifest.site.title}`;

	<Head>
		<Seo
			title={title}
			description={props.description}
			canonical={props.permalink === undefined
				? undefined
				: absoluteUrl(manifest.site.url, props.permalink)}
			openGraph={{ title, description: props.description }}
			robots={props.noIndex === true ? { index: false, follow: false } : undefined}
		/>
	</Head>
}

function Paginator(props: { previous?: DocLink; next?: DocLink }) @{
	@if (props.previous !== undefined || props.next !== undefined) {
		<nav class="octane-docs-paginator" aria-label="Documentation pages">
			<div>
				@if (props.previous !== undefined) {
					<ThemeLink href={props.previous.permalink}>← {props.previous.title}</ThemeLink>
				}
			</div>
			<div class="octane-docs-paginator__next">
				@if (props.next !== undefined) {
					<ThemeLink href={props.next.permalink}>{props.next.title} →</ThemeLink>
				}
			</div>
		</nav>
	}
}

function CardList(props: { items: DocLink[] }) @{
	<ul class="octane-docs-card-list">
		@for (const item of props.items; key item.permalink) {
			<li class="octane-docs-card">
				<ThemeLink href={item.permalink}>{item.title}</ThemeLink>
				@if (item.description !== undefined) {
					<p>{item.description}</p>
				}
			</li>
		}
	</ul>
}

export function Root(props: { children?: OctaneNode }) @{
	<>
		{props.children}
	</>
}

export function DocsRoot(props: { children?: OctaneNode }) @{
	const manifest = useDocusaurusManifest();
	const themeConfig = manifest.site.themeConfig as ClassicThemeConfig;

	<div class="octane-docusaurus">
		<Navbar config={themeConfig.navbar} />
		{props.children}
		<Footer baseUrl={manifest.baseUrl} config={themeConfig.footer} />
	</div>
}

export function DocVersionRoot(props: { children?: OctaneNode; version: DocsVersion }) @{
	<VersionContext.Provider value={props.version}>{props.children}</VersionContext.Provider>
}

export function DocRoot(props: {
	children?: OctaneNode;
	location: Location;
	route: RouteProps;
}) @{
	const version = useDocsVersion();
	const activeRoute = props.route.routes?.find((route) => route.path === props.location.pathname);
	const sidebarId = activeRoute?.attributes?.sidebar;
	const sidebar =
		typeof sidebarId === 'string' ? version.docsSidebars[sidebarId] ?? [] : [];

	<div class="octane-docs-layout">
		@if (sidebar.length > 0) {
			<aside class="octane-docs-sidebar" aria-label="Documentation sidebar">
				<SidebarItems items={sidebar} pathname={props.location.pathname} />
			</aside>
		}
		<main class="octane-docs-main">{props.children}</main>
	</div>
}

export function DocItem(props: { content: DocContent }) @{
	const manifest = useDocusaurusManifest();
	const version = useDocsVersion();
	const Content = props.content;
	const metadata = Content.metadata ?? {};
	const frontMatter = Content.frontMatter ?? {};
	const title = frontMatter.title ?? metadata.title ?? Content.contentTitle;
	const description = frontMatter.description ?? metadata.description;

	<>
		<PageMetadata
			title={title}
			description={description}
			permalink={metadata.permalink}
			noIndex={frontMatter.noIndex === true || version.noIndex === true || manifest.site.noIndex}
		/>
		<article class="octane-docs-article">
			<Content />
			<Paginator previous={metadata.previous} next={metadata.next} />
		</article>
	</>
}

export function DocCategoryGeneratedIndexPage(props: {
	categoryGeneratedIndex: {
		title: string;
		description?: string;
		permalink: string;
		navigation?: {
			previous?: DocLink;
			next?: DocLink;
		};
	};
}) @{
	const version = useDocsVersion();
	const page = props.categoryGeneratedIndex;
	const items = categoryItems(version, page.permalink);
	<div class="octane-docs-list-page">
		<PageMetadata
			title={page.title}
			description={page.description}
			permalink={page.permalink}
			noIndex={version.noIndex}
		/>
		<h1>{page.title}</h1>
		@if (page.description !== undefined) {
			<p>{page.description}</p>
		}
		<CardList items={items} />
		<Paginator previous={page.navigation?.previous} next={page.navigation?.next} />
	</div>
}

export function DocTagsListPage(props: {
	tags: Array<{ label: string; permalink: string; description?: string }>;
	location: Location;
}) @{
	const version = useDocsVersion();
	<div class="octane-docs-list-page">
		<PageMetadata title="Tags" permalink={props.location.pathname} noIndex={version.noIndex} />
		<h1>Tags</h1>
		<CardList items={props.tags.map((tag) => ({ ...tag, title: tag.label }))} />
	</div>
}

export function DocTagDocListPage(props: {
	tag: {
		label: string;
		description?: string;
		permalink: string;
		items: DocLink[];
	};
}) @{
	const version = useDocsVersion();
	<div class="octane-docs-list-page">
		<PageMetadata
			title={props.tag.label}
			description={props.tag.description}
			permalink={props.tag.permalink}
			noIndex={version.noIndex}
		/>
		<h1>{props.tag.label}</h1>
		@if (props.tag.description !== undefined) {
			<p>{props.tag.description}</p>
		}
		<CardList items={props.tag.items} />
	</div>
}
