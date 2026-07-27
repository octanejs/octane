import { Head, JsonLd, Link, Meta, Seo, Title } from '@octanejs/seo';

/** A layout that supplies defaults an inner page may override. */
function Layout(props: { children?: unknown }) @{
	<>
		<Title text="Fallback title" />
		<Meta name="description" content="layout description" />
		<Link rel="canonical" href="https://example.com/" />
		{props.children}
	</>
}

function Post(props: { slug: string }) @{
	<>
		<Seo
			title={'Post: ' + props.slug}
			canonical={'/blog/' + props.slug}
			site="https://example.com"
			languages={{ de: '/de/blog/' + props.slug, fr: '/fr/blog/' + props.slug }}
			jsonLd={{ '@type': 'Article', headline: 'Post: ' + props.slug }}
		/>
		<main>{'Body of ' + props.slug as string}</main>
	</>
}

export function Page(props: { slug: string }) @{
	<Head>
		<Layout>
			<Post slug={props.slug} />
		</Layout>
	</Head>
}

export function LayoutOnly() @{
	<Head>
		<Layout>
			<main>no page metadata</main>
		</Layout>
	</Head>
}

interface Tag {
	name: string;
	content: string;
}

function TagList(props: { tags: Tag[] }) @{
	<>
		@for (const tag of props.tags; key tag.name) {
			<Meta name={tag.name} content={tag.content} />
		}
	</>
}

export function DynamicList(props: { tags: Tag[] }) @{
	<Head>
		<TagList tags={props.tags} />
		<main>list</main>
	</Head>
}
