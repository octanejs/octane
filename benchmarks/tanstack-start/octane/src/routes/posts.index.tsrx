import { createFileRoute } from '@tanstack/octane-router';

export const Route = createFileRoute('/posts/')({
	component: PostsIndexComponent,
});

function PostsIndexComponent() @{
	<div data-testid="PostsIndexComponent">Select a post.</div>
}
