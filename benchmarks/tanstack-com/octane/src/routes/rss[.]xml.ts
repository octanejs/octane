import { createFileRoute } from '@octanejs/tanstack-router';
import { setResponseHeader } from '@octanejs/tanstack-start/server';
import { getPublishedPosts } from '~/utils/blog';
import { formatAuthors, publishedDateToUTCString } from '~/utils/blog-format';

function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function generateRSSFeed() {
	const posts = getPublishedPosts().slice(0, 50); // Most recent 50 posts
	const siteUrl = 'https://tanstack.com';
	const buildDate = new Date().toUTCString();

	const rssItems = posts
		.map((post) => {
			const postUrl = `${siteUrl}/blog/${post.slug}`;
			const pubDate = publishedDateToUTCString(post.published);
			const author = formatAuthors(post.authors);

			// Use excerpt if available, otherwise try to get first paragraph from content
			let description = post.excerpt || '';
			if (!description && post.content) {
				// Extract first paragraph after frontmatter
				const contentWithoutFrontmatter = post.content.replace(/^---[\s\S]*?---/, '').trim();
				const firstParagraph = contentWithoutFrontmatter.split('\n\n')[0];
				description = firstParagraph.replace(/!\[[^\]]*\]\([^)]*\)/g, ''); // Remove images
			}

			return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>${escapeXml(author)}</author>
      <description>${escapeXml(description)}</description>
      ${post.headerImage ? `<enclosure url="${escapeXml(siteUrl + post.headerImage)}" type="image/png" />` : ''}
    </item>`;
		})
		.join('');

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>TanStack Blog</title>
    <link>${siteUrl}/blog</link>
    <description>The latest news and updates from TanStack</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;
}

export const Route = createFileRoute('/rss.xml')({
	server: {
		handlers: {
			GET: async () => {
				const content = generateRSSFeed();

				setResponseHeader('Content-Type', 'application/xml; charset=utf-8');
				setResponseHeader('Cache-Control', 'public, max-age=300, must-revalidate');
				setResponseHeader(
					'Cloudflare-CDN-Cache-Control',
					'public, max-age=3600, stale-while-revalidate=3600',
				);

				return new Response(content);
			},
		},
	},
});
