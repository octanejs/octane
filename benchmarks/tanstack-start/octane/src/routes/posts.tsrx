import { useState } from 'octane';
import { Link, Outlet, createFileRoute } from '@tanstack/octane-router';
import { fetchPosts } from '../utils/posts.ts';

export const Route = createFileRoute('/posts')({
	head: () => ({
		meta: [{ title: 'Posts page' }],
	}),
	loader: async () => fetchPosts(),
	component: PostsComponent,
});

function PostsComponent() @{
	const posts = Route.useLoaderData();
	const [hydrationCount, setHydrationCount] = useState(0);

	<div class="p-2 flex gap-2">
		<button
			data-testid="posts-parent-hydration-counter"
			onClick={() => setHydrationCount((count) => count + 1)}
		>
			{'Parent hydration count: ' + hydrationCount}
		</button>
		<ul class="list-disc pl-4">
			@for (const post of [
				...posts,
				{ id: 'i-do-not-exist', title: 'Non-existent Post' },
			]; key post.id) {
				<li class="whitespace-nowrap">
					<Link
						to="/posts/$postId"
						params={{ postId: post.id }}
						class="block py-1 text-blue-800 hover:text-blue-600"
						activeProps={{ class: 'text-black font-bold' }}
					>
						<div>{post.title.substring(0, 20)}</div>
					</Link>
				</li>
			}
		</ul>
		<hr />
		<Outlet />
	</div>
}
