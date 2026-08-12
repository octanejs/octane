import useSWR, { mutate } from '@octanejs/swr';
import useSWRInfinite from '@octanejs/swr/infinite';

let requests = 0;
const fetchProfile = async () => ({ name: 'Octane', request: ++requests });
const fetchPage = async ([, page]: [string, number]) => `page ${page + 1}`;

export function SWRDemo() @{
	const first = useSWR('demo-profile', fetchProfile);
	const second = useSWR('demo-profile', fetchProfile);
	const pages = useSWRInfinite((page) => (page < 3 ? ['demo-page', page] : null), fetchPage, {
		initialSize: 1,
	});

	<div>
		<h2 class="demo-title">{'SWR binding'}</h2>
		<p
			class="demo-blurb"
		>{'Two consumers dedupe one request; mutation and pagination stay local and deterministic.'}</p>
		<p>{'first: ' + (first.data?.name ?? 'loading')}</p>
		<p>{'second: ' + (second.data?.name ?? 'loading')}</p>
		<p>{'fetches: ' + requests}</p>
		<p>{'pages: ' + (pages.data?.join(', ') ?? 'loading')}</p>
		<div class="row">
			<button
				class="btn"
				onClick={() => mutate(
					'demo-profile',
					(current) => ({
						...current!,
						name: current?.name === 'Octane' ? 'Optimistic' : 'Octane',
					}),
					false,
				)}
			>{'optimistic mutate'}</button>
			<button
				class="btn"
				onClick={() => pages.setSize((size) => Math.min(size + 1, 3))}
			>{'load page'}</button>
		</div>
	</div>
}
