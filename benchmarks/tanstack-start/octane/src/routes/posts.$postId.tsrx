import { ErrorComponent, createFileRoute } from '@tanstack/octane-router';
import { fetchPost } from '../utils/posts.ts';
import { NotFound } from '../components/NotFound.tsrx';

export const Route = createFileRoute('/posts/$postId')({
	loader: async ({ params: { postId } }) => fetchPost({ data: postId }),
	errorComponent: PostErrorComponent,
	component: PostComponent,
	notFoundComponent: PostNotFound,
});

function PostErrorComponent(props: { error: unknown }) @{
	<ErrorComponent error={props.error} />
}

function PostNotFound() @{
	<NotFound>Post not found</NotFound>
}

function PostComponent() @{
	const post = Route.useLoaderData();

	<div class="space-y-2">
		<h4 class="text-xl font-bold underline">{post.title}</h4>
		<div class="text-sm">{post.body}</div>
	</div>
}
