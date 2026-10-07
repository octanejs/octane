'use strong';

const POSTS = [
	{ id: 'launch', title: 'Launch day', publishedAt: '2026-03-01T06:00:00Z' },
	{ id: 'recap', title: 'First week recap', publishedAt: '2026-03-08T23:30:00Z' },
];
const publishedDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

export function App() @{
	<ul>
		@for (const post of POSTS; key post.id) {
			<li>
				<h2>{post.title as string}</h2>
				<time dateTime={post.publishedAt}>
					{publishedDate.format(new Date(post.publishedAt)) as string}
				</time>
			</li>
		}
	</ul>
}
