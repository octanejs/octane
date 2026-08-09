import type { Page } from '@inertiajs/core';
import { useState } from 'octane';
import { usePage } from '@octanejs/inertia';
import PageContext from 'inertia-page-context';

const initialPage: Page<{ user: string }> = {
	component: 'Dashboard',
	props: { user: 'Ada' },
	url: '/dashboard',
	version: null,
	clearHistory: false,
	encryptHistory: false,
};

function Reader() @{
	const page = usePage<{ user: string }>();
	<div>
		<span id="component">{page.component as string}</span>
		<span id="user">{page.props.user as string}</span>
		<span id="url">{page.url as string}</span>
	</div>
}

export function UsePageParity() @{
	const [page, setPage] = useState(initialPage);
	<PageContext.Provider value={page}>
		<div>
			<Reader />
			<button
				id="next"
				onClick={function () {
					setPage({
						component: 'Profile',
						props: { user: 'Grace' },
						url: '/profile',
						version: null,
						clearHistory: false,
						encryptHistory: false,
					});
				}}
			>
				next
			</button>
		</div>
	</PageContext.Provider>
}
