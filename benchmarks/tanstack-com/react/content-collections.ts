import { defineCollection, defineConfig } from '@content-collections/core';
import { libraryIds } from '~/libraries/libraries';
import { normalizeRedirectFrom } from '~/utils/redirects';
import { z } from 'zod';

const libraryIdSet = new Set<string>(libraryIds);
const libraryListSchema = z.string().refine(
	(value) => {
		const libraries = value
			.split(',')
			.map((library) => library.trim())
			.filter(Boolean);

		return libraries.length > 0 && libraries.every((library) => libraryIdSet.has(library));
	},
	{
		message: `Expected comma-separated library ids: ${libraryIds.join(', ')}`,
	},
);

const posts = defineCollection({
	name: 'posts',
	directory: './src/blog',
	include: '*.md',
	schema: z.object({
		title: z.string(),
		published: z.iso.date(),
		draft: z.boolean().optional(),
		excerpt: z.string(),
		authors: z.string().array(),
		library: libraryListSchema.optional(),
		content: z.string(),
		redirect_from: z.string().array().optional(),
	}),
	transform: ({ content, ...post }) => {
		// Extract header image (first image after frontmatter)
		const headerImageMatch = content.match(/!\[([^\]]*)\]\(([^)]+)\)/);
		const headerImage = headerImageMatch ? headerImageMatch[2] : undefined;
		const redirectFrom = normalizeRedirectFrom(post.redirect_from);

		return {
			...post,
			slug: post._meta.path,
			headerImage,
			redirect_from: redirectFrom,
			redirectFrom,
			content,
		};
	},
});

export default defineConfig({
	content: [posts],
});
