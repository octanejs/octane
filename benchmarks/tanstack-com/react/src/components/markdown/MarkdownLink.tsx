import { Link } from '@tanstack/react-router';
import type { HTMLProps } from 'react';
import { isSafeHref } from '~/utils/url-boundary';

function isRelativeLink(link: string) {
	return (
		!link.startsWith(`/`) &&
		!link.startsWith('http://') &&
		!link.startsWith('https://') &&
		!link.startsWith('//') &&
		!link.startsWith('#') &&
		!link.startsWith('mailto:') &&
		!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link)
	);
}

function isStaticAssetLink(link: string) {
	const [pathname] = link.split(/[?#]/);
	return /\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith('.md');
}

function isRoutableInternalLink(link: string) {
	return (
		link.startsWith('/') &&
		!link.startsWith('//') &&
		link !== '/api' &&
		!link.startsWith('/api/') &&
		!isStaticAssetLink(link)
	);
}

function normalizeRoutableInternalPathname(pathname: string) {
	const routerFrameworkMatch = pathname.match(/^\/router\/([^/]+)\/docs\/framework\/[^/]+\/(.+)$/);

	if (!routerFrameworkMatch) {
		return pathname;
	}

	const [, version, docsPath] = routerFrameworkMatch;

	if (!version || !docsPath || docsPath.startsWith('examples/')) {
		return pathname;
	}

	return `/router/${version}/docs/${docsPath}`;
}

export function MarkdownLink({ href: hrefProp, ...rest }: HTMLProps<HTMLAnchorElement>) {
	const href = hrefProp ?? '';

	if (!isSafeHref(href)) {
		// eslint-disable-next-line jsx-a11y/anchor-has-content
		return <a {...rest} />;
	}

	if (isRoutableInternalLink(href)) {
		const [hrefWithoutHash, hash] = href.split('#');
		const hrefWithoutMd = normalizeRoutableInternalPathname(hrefWithoutHash.replace('.md', ''));

		return <Link {...rest} to={hrefWithoutMd} hash={hash} preload={false} ref={undefined} />;
	}

	if (!isRelativeLink(href)) {
		// eslint-disable-next-line jsx-a11y/anchor-has-content
		return <a {...rest} href={hrefProp} />;
	}

	const [hrefWithoutHash, hash] = href.split('#');
	let hrefWithoutMd = hrefWithoutHash.replace('.md', '');

	// Force relative links to resolve one level higher
	if (hrefWithoutMd.startsWith('../')) {
		hrefWithoutMd = hrefWithoutMd.replace(/^\.\.\//gm, '../../');
	} else if (hrefWithoutMd.startsWith('./')) {
		hrefWithoutMd = hrefWithoutMd.replace(/^\.\//gm, '../');
	} else {
		hrefWithoutMd = `../${hrefWithoutMd}`;
	}

	return (
		<Link
			{...rest}
			unsafeRelative="path"
			to={hrefWithoutMd}
			hash={hash}
			preload={false}
			ref={undefined}
		/>
	);
}
