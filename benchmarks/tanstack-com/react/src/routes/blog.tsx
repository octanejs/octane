import { createFileRoute } from '@tanstack/react-router';
import { seo } from '~/utils/seo';
import { NotFound } from '~/components/NotFound';

export const Route = createFileRoute('/blog')({
	head: () => ({
		meta: seo({
			title: 'Blog | TanStack',
			description: 'The latest news and blog posts from TanStack!',
		}),
	}),
});

export function PostNotFound() {
	return <NotFound />;
}
