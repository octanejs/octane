# SEO for Octane (`@octanejs/seo`), plan

Octane can render document metadata: the compiler partitions `<title>`,
`<meta>`, and `<link>` out of the body wherever they are authored and routes
them through a head channel (`ssrHeadEl` on the server, `headBlock` on the
client) with paired ownership markers that hydration adopts. What Octane has no
answer for is *SEO*: getting the right metadata, for the right route, into the
served `<head>`, before a crawler reads it.

This plan covers a new `@octanejs/seo` package plus the two owning-layer fixes
it needs. It is written against measured behavior; every claim below marked
"verified" was reproduced with a throwaway probe against the real renderer, not
inferred from source.

## The three defects

### 1. Hoisted metadata does not reach `<head>` in template-based apps

`spliceHead` (`runtime.server.ts`) inserts the head buffer before `</head>` when
the render produced a document, and otherwise **prepends it to the body**. The
`@octanejs/app-core` metaframework renders only the `#root` interior and
concatenates `prefix + css + body + suffix`, so the prepended head buffer lands
inside `<div id="root">`.

Verified by reproducing app-core's assembly verbatim around a page that authors
a title, description, and canonical:

```html
<head><meta charset="utf-8"><title>Template Title</title><!--ssr-head--></head>
<body><div id="root">
  <title>Post: hello</title>
  <meta name="description" content="per-route description">
  <link rel="canonical" href="https://example.com/p">
  <main>body text</main>
</div></body>
```

Consequences: the document has two `<title>` elements and the generic template
one wins, because the first in tree order is authoritative. `<link
rel="canonical">` and `<meta name="description">` outside `<head>` are ignored.
Identical in buffered and streaming mode, dev and production, because
`render-route.js` and `production.js` both splice only the hydration data script
into `<!--ssr-head-->`.

Apps that render the whole document are unaffected, which is why
`@octanejs/tanstack-start` works today: `website/src/routes/__root.tsrx` renders
`<Html><Head>`, so `</head>` exists in the render output and both `spliceHead`
and streaming document mode engage.

### 2. There is no merge or override across the tree

Verified: a layout `<title>` plus a page `<title>` emits both, and the **outer**
one wins. Two `<meta name="description">` both ship. This is backwards from
every SEO system, where the most specific declaration wins. Nothing in core
dedupes, and nothing should: head keys are compiler-assigned per call site and
the client adopter is built on that identity, so override semantics belong to
the layer that owns the metadata model.

### 3. Metadata derived from suspended data vanishes in streaming

This finding determines the architecture. Streaming a page whose title comes
from `use(promise)`:

- chunk 0, the shell and therefore what a crawler that does not execute the swap
  scripts sees: **zero** `<title>`, **zero** `<meta>`;
- chunk 1: the resolved article markup, still no head tags.

The shell flushes before the data settles, and `docs/ssr.md` already lists
streamed head hoisting as a known gap. So a collect-during-render design emits
*nothing* for exactly the pages whose metadata matters most (posts, products,
listings), and does so silently.

For the record, merge-then-emit *is* mechanically possible in the string
renderer: a sibling rendered after the children sees descendant registrations
written into a provider-owned `Map`, the result is idempotent across `prerender`
suspense passes because registrations are identity-keyed, and the emitted tags
land in the head buffer ahead of all body markup. It is rejected as the primary
model only because of the streaming result above.

### Current state of octanejs.dev

The website is the proof case. `website/src/hooks/use-title.ts` sets
`document.title` from `useEffect`, and says so: *"Effects never run during SSR,
so crawlers see the template title in the served HTML and this only refines it
after hydration."* Every docs page, plus playground, benchmarks, and error
pages, serves one identical title and description.
`website/tests/page-titles.test.ts` asserts only post-render `document.title`.
`sitemap.xml` and `robots.txt` are hand-maintained files in `public/`, kept
honest by `website/tests/seo.test.ts` rather than generated.

## Architectural decision

Defect 3 forces route-level resolution: metadata must be resolved and awaited
**before the render begins**, so the shell always carries it. This is the same
conclusion Next's `generateMetadata`, Remix's `meta()`, TanStack's `head()`, and
Nuxt reached, and it has the side benefit that metadata is available to the
response itself (status, headers) and to sitemap generation.

The render-time component form survives as an escape hatch for props-derived
metadata, with a development diagnostic for the suspended case rather than a
silent empty head.

The cost is honest and must be documented: a resolver on the TTFB path. Octane
has no `cache()` by design, so the package ships a request-scoped memo helper
keyed on `context.state` (already threaded to page and layout props on the
server) so the resolver and the page do not fetch twice.

## Scope

### `octane` (core), the head channel

Buffered renderers gain a `head` field on `RenderResult`; streaming gains the
same content as a resolved property on the returned stream, available once the
shell is ready and therefore before the caller composes its prefix. Both are
opt-in through a `RenderOptions` flag so that consumers rendering a document
(TanStack Start, and every current caller) keep the existing fold and byte
output unchanged.

This closes defect 1 for everyone authoring raw `<title>`/`<meta>` in a
component, independently of `@octanejs/seo`. It is not a React divergence:
React folds head resources into the document because React renders the
document, and Octane's template mode has no document to fold into.
`docs/differences-from-react.md` and `docs/ssr.md` both need updating, the
latter's "Not built yet" list included.

### `@octanejs/app-core` and `@octanejs/vite-plugin`

- Resolve `seo` exports from the matched route and its layout before rendering,
  and splice the merged result into `<!--ssr-head-->` alongside the existing
  data script.
- Consume the core head channel so in-component metadata lands in `<head>` too.
- Honor a resolver-returned `status` so a missing record serves a real 404 or
  410 rather than 200 with a not-found body.
- Register the sitemap and `robots.txt` routes when configured.

### `@octanejs/seo` (new)

Everything user-facing.

**Route metadata.** Static or resolved, co-located with the page, and
statically detectable so the vite plugin can keep resolvers out of the client
bundle:

```tsrx
export const seo = defineSeo({ title: 'Blog', description: '…' });
```

```tsrx
export const seo = defineSeo(async ({ params, url, state }) => {
  const post = await getPost(params.slug, state);
  if (!post) return { status: 404, robots: 'noindex' };
  return {
    title: post.title,
    description: post.excerpt,
    canonical: `/blog/${post.slug}`,
    openGraph: { type: 'article', images: post.cover, publishedTime: post.date },
    alternates: { languages: { de: `/de/blog/${post.slug}`, 'x-default': `/blog/${post.slug}` } },
    jsonLd: article({ headline: post.title, author: post.author }),
  };
});
```

**Merge engine.** Site defaults, then outermost layout, then innermost page.
Merged per identity key: `title`, `meta[name|property|http-equiv]`,
`link[rel]` discriminated further by `hreflang`/`media`/`sizes`/`type`, and
`jsonLd[@type + @id]`. Innermost wins, which closes defect 2. The merge is a
pure function over an ordered array of descriptors, so it is unit-testable
without a renderer and reusable by the TanStack adapter.

**Site configuration.** `site` (the origin, which is what makes canonical and
`og:image` absolute, a hard requirement for scrapers), `titleTemplate`,
`defaultTitle`, the Open Graph and Twitter shells, `locale`, `trailingSlash`.

**Component escape hatch.** `<Seo title={…} description={…} />` for
props-derived metadata, backed by a client head manager that adopts the
server-rendered tags on hydration (matched by identity key, so no duplication)
and patches in place on client navigation rather than removing and re-adding,
which would re-fetch `<link>` resources. Router-agnostic: it updates when the
router swaps the page component, so no per-router adapter is needed for the
client path.

**Structured data.** Typed builders (`article`, `product`, `breadcrumbs`,
`organization`, `website`, `faq`) merged into a single
`<script type="application/ld+json">` `@graph`. Core already escapes inline
script content through `escapeEntireInlineScriptContent`, so the package does
not hand-roll escaping.

**Artifacts.** `/sitemap.xml` and `/robots.txt` derived from the route table,
with an enumerator for dynamic segments, `lastmod` support, and index sharding
past the 50,000-URL limit. Build-time emission for static routes, request-time
`ServerRoute` when the content is dynamic, selected by config.

**Hygiene.** Middleware for canonical host and trailing-slash 301s, and an
`X-Robots-Tag` switch so preview deployments are `noindex` (the single most
common production SEO accident).

**Diagnostics and audit.** A development report per response (missing title,
title and description length, non-absolute canonical or `og:image`, missing
`og:image:alt`, duplicate identity keys, `noindex` in a production build,
multiple `<h1>`), plus an importable `auditHtml(html)` so applications can gate
CI on their own standard. Shipping the standard as an executable check, rather
than prose, is the part of this that makes the package opinionated without
being restrictive.

## Phases

Each phase is independently landable and independently valuable.

1. **Core head channel plus the app-core splice.** Closes defect 1. Regression
   coverage: an app-core-shaped render asserting authored metadata lands inside
   `<head>` and exactly one `<title>` survives; hydration adoption unchanged for
   both fold and separate modes; document-rendering callers byte-identical.
   Performance: head assembly is once per render on a cold path, but the
   streaming shell composition is on the response path, so it needs the
   streaming-ssr benchmark as a control.
2. **`@octanejs/seo` v0.1.** `defineSeo`, the merge engine, app-core route
   resolution, the `<Seo>` component and client head manager, `<JsonLd>`.
3. **Artifacts and hygiene.** Sitemap, `robots.txt`, canonical middleware,
   `X-Robots-Tag`.
4. **Diagnostics, `auditHtml`, and `docs/seo.md`.**
5. **Dogfood octanejs.dev.** Replace the `useTitle` effects with real
   per-route SSR metadata, generate the sitemap instead of hand-maintaining it,
   and let `website/tests/seo.test.ts` and `page-titles.test.ts` become the
   end-to-end regression. Requires the TanStack Router adapter below.
6. **Optional: Open Graph image generation.**

The TanStack Router adapter (`@octanejs/seo/tanstack-router`), feeding
`head()` from the same `defineSeo` descriptors through the shared merge engine,
follows phase 2 and gates phase 5. TanStack users have a working parallel system
in the meantime, which is why app-core, with no metadata story at all, goes
first.

## Out of scope

- Changing core's head dedup or override semantics. Head keys are
  compiler-assigned per call site and the client adopter is built on that
  identity; override belongs to the metadata model, not the emitter.
- Closing the streamed-head-hoisting gap for metadata authored *inside* a
  suspended boundary. Route-level resolution makes it unnecessary for SEO, and
  the package diagnoses the case instead.
- Selective hydration, error digests, and the rest of `docs/ssr.md`'s "Not built
  yet" list.

## Open questions

- Whether `seo`-returned `status` should be able to set arbitrary response
  headers, or stay restricted to status plus `X-Robots-Tag`. Restricted is
  safer and middleware already covers the general case.
- Whether the sitemap enumerator for dynamic segments should live in
  `octane.config.ts` or beside the route it enumerates. Co-location is more
  consistent with `defineSeo`, but the config already owns the route table.
- Whether `defineSeo` resolvers should run inside the same request-scoped async
  context as middleware, which would let the memo helper be implicit rather than
  threading `state`.
