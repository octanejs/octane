import { createFileRoute } from '@octanejs/tanstack-router';

export const Route = createFileRoute('/posts/')({
	component: PostsIndexComponent,
});

function PostsIndexComponent() @{
	<div data-testid="PostsIndexComponent">Select a post.</div>
}
