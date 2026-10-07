'use strong';
// Workaround: pass the formatting options through a module constant.

const POSTS = [
	{ id: 'launch', title: 'Launch day', publishedAt: '2026-03-01T06:00:00Z' },
	{ id: 'recap', title: 'First week recap', publishedAt: '2026-03-08T23:30:00Z' },
];
const DATE_OPTIONS = { dateStyle: 'medium' } as const;

export function App() @{
	<ul>
		@for (const post of POSTS; key post.id) {
			<li>
				<h2>{post.title as string}</h2>
				<time dateTime={post.publishedAt}>
					{new Date(post.publishedAt).toLocaleDateString('en-US', DATE_OPTIONS) as string}
				</time>
			</li>
		}
	</ul>
}
