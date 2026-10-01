'use strong';
// Workaround: pass a locale but no time zone.

const POSTS = [
	{ id: 'launch', title: 'Launch day', publishedAt: '2026-03-01T06:00:00Z' },
	{ id: 'recap', title: 'First week recap', publishedAt: '2026-03-08T23:30:00Z' },
];

export function App() @{
	<ul>
		@for (const post of POSTS; key post.id) {
			<li>
				<h2>{post.title as string}</h2>
				<time dateTime={post.publishedAt}>{new Date(post.publishedAt).toLocaleDateString(
					'en-US',
				) as string}</time>
			</li>
		}
	</ul>
}
