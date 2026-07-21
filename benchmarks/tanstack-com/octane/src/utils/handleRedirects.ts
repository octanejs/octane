import { redirect } from '@octanejs/tanstack-router';

type RedirectItem = { from: string; to: string };

export function handleRedirects(
	redirectItems: Array<RedirectItem>,
	urlFromRequest: string,
	urlFromPathStart: string,
	urlToPathStart: string,
	urlToQueryParams: string,
) {
	const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tanstack.com';

	const url = new URL(urlFromRequest, origin);

	redirectItems.forEach((item) => {
		const fromPath = `${urlFromPathStart}/${item.from}`.replace(/\/+/g, '/');
		const matchesPath = url.pathname === fromPath || url.pathname.startsWith(`${fromPath}/`);

		if (matchesPath) {
			const urlTo = new URL(`${url.origin}${urlToPathStart}/${item.to}`);
			urlTo.search = urlToQueryParams;

			throw redirect({
				href: urlTo.href,
			});
		}
	});
}
