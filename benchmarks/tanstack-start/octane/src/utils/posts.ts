import { notFound } from '@tanstack/octane-router';
import { createServerFn } from '@tanstack/octane-start';
import { getPost, listPosts } from '../../../shared/posts-data.mjs';

export type PostType = {
	id: string;
	title: string;
	body: string;
};

export const fetchPost = createServerFn({ method: 'GET' })
	.validator((postId: string) => postId)
	.handler(async ({ data: postId }) => {
		const post = (await getPost(postId)) as PostType | null;
		if (!post) {
			throw notFound();
		}
		return post;
	});

export const fetchPosts = createServerFn({ method: 'GET' }).handler(
	async () => (await listPosts()) as Array<PostType>,
);
