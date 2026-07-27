# `@octanejs/seo`

Declarative document metadata for Octane: server-rendered into `<head>`, adopted
on hydration, and merged so the most specific declaration wins.

```tsx
import { Head, Link, Meta, Script, Title } from '@octanejs/seo';

function App() @{
	<Head>
		<Head>
			<Title text="Acme" />
			<Meta name="description" content="Widgets for everyone" />
		</Head>
		<Router />
	</Head>
}

function ProductPage(props: { product: Product }) @{
	<>
		<Head>
			<Title text={props.product.name} />
			<Meta name="description" content={props.product.blurb} />
			<Link rel="canonical" href={'/p/' + props.product.slug} />
			<Script type="application/ld+json" json={{ '@type': 'Product', name: props.product.name }} />
		</Head>
		<main>…</main>
	</>
}
```

The product page's title and description replace the app-level ones. Everything
else the app declared stays.

## Why a merge exists

The platform resolves duplicates by taking the **first** in tree order:
`document.title` is defined as the first `<title>` element in the document, and
a crawler reads the first `meta[name="description"]`. Authoring order runs the
other way, with app defaults written before page specifics, so simply emitting
both would let the generic value win every time. Registrations are therefore
keyed by identity and the **last** one wins.

Identity is what the tag names, not the tag type. `meta[name]`,
`meta[property]`, and `meta[http-equiv]` are separate channels. JSON-LD is keyed
by `@type` (plus `@id`), so an `Article` replaces an `Article` while a
`BreadcrumbList` sits alongside it.

`<link>` needs three rules, because `href` is sometimes the value being set and
sometimes the thing being identified:

| rel | identity | effect |
| --- | --- | --- |
| `canonical`, `manifest`, `author`, `license`, `prev`, `next` | `rel` alone | one per document |
| `alternate` (`hreflang`/`type`/`media`/`title`), `icon` and `apple-touch-icon` (`sizes`/`type`), `mask-icon`, `search` | the named slot, **not** `href` | a page moving the German alternate or the 32×32 icon replaces it |
| everything else, including `preload`, `prefetch`, `preconnect`, `modulepreload`, `stylesheet`, and any rel not listed above | the target URL | two font preloads or two stylesheets coexist |

Unknown rels fall in the last group deliberately: emitting two tags is a smaller
mistake than silently dropping one.

## `<Head>`, and where to put it

Wrap the app in one:

```tsx
<Head>
	<App />
</Head>
```

Then use `<Head>` again wherever metadata belongs. **Position carries no
meaning.** Two blocks merge whether one contains the other or they sit in
unrelated components, and precedence never depends on nesting depth: the last
registration of a given identity wins, so a page overrides a layout simply by
rendering later. Tags written bare under the outer `<Head>`, with no block around
them, behave identically.

The outermost `<Head>` is what makes that true. The merge has to see every
registration before it emits anything, and a string renderer emits in document
order, so blocks that owned their own metadata would each emit a set and the
platform's first-wins rule would hand the page to whichever rendered first. This
would then quietly break:

```tsx
function Page() @{
	<>
		<Head><Title text="Listing" /></Head>
		<Detail />                    {/* its own <Head> is a SIBLING */}
	</>
}
```

With an outer `<Head>` around the app, `<Detail>` wins as written. A tag with no
`<Head>` above it throws, and two `<Head>` elements where neither contains the
other are reported in development.

## Components

| Component | Purpose |
| --- | --- |
| `<Title text="…" />` | Document title |
| `<Meta name/property/http-equiv … />` | Any meta tag |
| `<Link rel="…" href="…" />` | canonical, alternate, icon, manifest |
| `<Script type json / text />` | JSON-LD and other head scripts |
| `<Seo … />` | The whole metadata object at once |

`<Title>` takes its text as a **prop**, not JSX children. Element children
compile to a children block (a function), and coercing one to a string would put
source code in the document title, so that case throws instead.

`<Seo>` is the object form and expands to the tags above:

```tsx
<Seo
	title="Post title"
	description="Post summary"
	canonical="/blog/post"
	site="https://example.com"
	titleTemplate="%s · Example"
	openGraph={{ type: 'article', images: [{ url: '/og.png', alt: 'Post', width: 1200, height: 630 }] }}
	twitter={{ card: 'summary_large_image', site: '@example' }}
	languages={{ de: '/de/blog/post', 'x-default': '/blog/post' }}
	robots={{ index: true, follow: true, maxImagePreview: 'large' }}
	jsonLd={{ '@type': 'Article', headline: 'Post title' }}
/>
```

## App-level settings

Three things are declared once and apply everywhere, because the component that
knows them is rarely the one that renders a page:

- **`site`** absolute-ises the URLs a consumer reads without a base: `canonical`,
  `link rel="alternate"` hreflang addresses, `og:url`, `og:image`, and
  `twitter:image`. It deliberately does **not** touch subresources the browser
  fetches, so `preload`, `prefetch`, `modulepreload`, `stylesheet`, `icon`, and
  `manifest` keep resolving against the document actually serving the response.
  Rewriting those would make a preview deploy carrying the production `site` pull
  fonts, CSS, and modules from production.
- **`titleTemplate`** wraps each page's title, so `%s · Acme` applies to a page
  that only sets `title: 'Pricing'`.
- **The Open Graph and Twitter shell.** Declare `openGraph`/`twitter` once and
  `og:title`, `og:description`, `og:url`, `twitter:title`, and
  `twitter:description` are mirrored from whatever page renders, unless that page
  names them itself. Only families you actually declared are filled, so an app
  that never asked for Open Graph never emits it.

```tsx
// once, near the root
<Seo
	site="https://example.com"
	titleTemplate="%s · Example"
	openGraph={{ type: 'website', siteName: 'Example' }}
	twitter={{ card: 'summary_large_image' }}
/>

// and in a page, anywhere below
<Seo title="Pricing" description="Plans and limits." canonical="/pricing" />
```

All three are applied after the merge, once the whole tree has registered. The
social mirror uses the raw title rather than the templated one, since
`og:site_name` already carries what a template adds.

## Server rendering

Metadata registered during render reaches `<head>` in the served HTML, which is
the point: an effect-based approach never runs on the server, so crawlers would
see nothing. Under `@octanejs/vite-plugin` this works with no configuration.

For a custom server, render with `headChannel: 'separate'` and splice the
returned metadata into your template's `<head>`:

```ts
const { html, css, head } = await prerender(App, props, { headChannel: 'separate' });
```

Streaming uses `onHeadReady(head)`, which fires before the shell is written. See
`docs/ssr.md`.

Two caveats worth knowing:

- **Remove any static `<title>` from `index.html`.** The hoisted metadata is
  spliced at `<!--ssr-head-->`, after it, so a template title would win.
- **Metadata that depends on suspended data does not reach a streamed shell.**
  The shell flushes before the data settles. Derive metadata from data you
  already have, or use the buffered renderer for those routes.

## Hydration and navigation

The client adopts the server's elements instead of appending its own, updates
them in place rather than replacing them (a swapped `<link>` would re-fetch its
resource), and removes what it owns when a page unmounts, so navigating between
routes never accumulates stale canonicals or `og:image` tags.
