import { Head, Link, Meta, Script, Seo, Title } from '@octanejs/seo';

/** One provider, tags grouped in a <Head> block. */
export function Grouped() @{
	<Head>
		<Head>
			<Title text="Grouped" />
			<Meta name="description" content="grouped description" />
			<Link rel="canonical" href="https://x.dev/grouped" />
			<Script type="application/ld+json" json={{ '@type': 'Article', headline: 'Grouped' }} />
		</Head>
		<main>grouped</main>
	</Head>
}

/** The identical tags written bare under the provider, with no <Head> block. */
export function Bare() @{
	<Head>
		<Title text="Grouped" />
		<Meta name="description" content="grouped description" />
		<Link rel="canonical" href="https://x.dev/grouped" />
		<Script type="application/ld+json" json={{ '@type': 'Article', headline: 'Grouped' }} />
		<main>grouped</main>
	</Head>
}

/** A page deep in the tree carrying its own block, beside the app-level one. */
function ProductPage() @{
	<>
		<Head>
			<Title text="Deep" />
			<Link rel="canonical" href="https://x.dev/deep" />
		</Head>
		<main>product</main>
	</>
}

export function Nested() @{
	<Head>
		<Head>
			<Title text="Outer" />
			<Meta name="description" content="outer" />
		</Head>
		<section>
			<ProductPage />
		</section>
	</Head>
}

/** A raw (non-JSON) script body. */
export function RawScript() @{
	<Head>
		<Head>
			<Script type="text/plain" seoKey="notes" text="hello & goodbye" />
		</Head>
		<main>raw</main>
	</Head>
}

/**
 * `site` and `titleTemplate` declared once near the root, with the page naming
 * only its own title and a relative canonical. This is how apps actually set
 * them, and the page must inherit both.
 */
function InheritingPage() @{
	<Head>
		<Seo title="Lisbon" canonical="/trips/lisbon" openGraph={{ images: ['/og/lisbon.png'] }} />
	</Head>
}

export function AppLevelConfig() @{
	<Head>
		<Seo site="https://x.dev" titleTemplate="%s · Wayfinder" />
		<section>
			<InheritingPage />
		</section>
	</Head>
}

/**
 * A layout's language alternates and icon, then a page moving both to new URLs.
 * The page must replace them rather than adding a second of each.
 */
function RelocatedPage() @{
	<Head>
		<Link rel="alternate" hreflang="de" href="/de/page" />
		<Link rel="icon" sizes="32x32" href="/new-icon.png" />
	</Head>
}

export function LinkOverride() @{
	<Head>
		<Head>
			<Link rel="alternate" hreflang="de" href="/de/layout" />
			<Link rel="alternate" hreflang="fr" href="/fr/layout" />
			<Link rel="icon" sizes="32x32" href="/old-icon.png" />
			<Link rel="icon" sizes="16x16" href="/small.png" />
			<Link rel="preload" as="font" href="/a.woff2" />
			<Link rel="preload" as="font" href="/b.woff2" />
		</Head>
		<RelocatedPage />
	</Head>
}

/** An author-controlled title carrying regex replacement patterns. */
function HostileTitlePage() @{
	<Head>
		<Seo title="Deals: 50% off $& and $' plus $1" />
	</Head>
}

export function HostileTitle() @{
	<Head>
		<Seo titleTemplate="%s · Shop" />
		<HostileTitlePage />
	</Head>
}

/** The app declares only the social shell; the page declares only its content. */
function ContentPage() @{
	<Head>
		<Seo title="Go somewhere, slowly" description="City breaks, slowly." canonical="/" />
	</Head>
}

export function SocialShell() @{
	<Head>
		<Seo
			site="https://x.dev"
			openGraph={{ type: 'website', siteName: 'Wayfinder' }}
			twitter={{ card: 'summary_large_image' }}
		/>
		<ContentPage />
	</Head>
}

/**
 * An openGraph block that emits no `og:` tag at all. Opting in is about having
 * declared the family, so the page title must still be mirrored.
 */
function TitleOnlyPage() @{
	<Head>
		<Seo title="Post" />
	</Head>
}

export function OpenGraphWithoutOgTags() @{
	<Head>
		<Seo openGraph={{ publishedTime: '2026-01-01' }} />
		<TitleOnlyPage />
	</Head>
}

/**
 * The page sets `title` AND `titleTemplate` on the same `<Seo>`, while the app
 * declared only the social shell. The mirrored social title must still be the
 * raw one: `og:site_name` already carries what the template adds.
 */
function TemplatedPage() @{
	<Head>
		<Seo title="Pricing" titleTemplate="%s · Acme" />
	</Head>
}

export function TemplateOnPage() @{
	<Head>
		<Seo openGraph={{ type: 'website', siteName: 'Acme' }} twitter={{ card: 'summary' }} />
		<TemplatedPage />
	</Head>
}

/** Per-request config, to prove one render cannot inherit another's. */
export function ConfiguredPage(props: { site: string; suffix: string; title: string }) @{
	<Head>
		<Seo site={props.site} titleTemplate={'%s' + props.suffix} openGraph={{ type: 'website' }} />
		<Seo title={props.title} canonical="/p" />
	</Head>
}

// Hoisted so the formatter cannot collapse the expression containers into plain
// attributes: these values contain quotes, and inlining them would terminate the
// attribute early and change what the fixture tests.
const MARKUP_TITLE = '</title><script>alert(1)</script>';
const MARKUP_DESCRIPTION = 'a "quoted" & <b>bold</b> value';
const QUOTE_BREAKOUT = 'x" onload="alert(1)';

/** A title and description carrying markup, to check the served bytes. */
export function HostileMarkup() @{
	<Head>
		<Seo title={MARKUP_TITLE} description={MARKUP_DESCRIPTION} />
	</Head>
}

/** The classic attribute-breakout vector. */
export function QuoteBreakout() @{
	<Head>
		<Meta name="description" content={QUOTE_BREAKOUT} />
	</Head>
}
