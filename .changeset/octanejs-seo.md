---
'@octanejs/seo': patch
---

New package: declarative document metadata that actually reaches `<head>` in the
served HTML.

```tsx
<Head>
  <App />
</Head>

// …and again anywhere below, in any component
<Head>
  <Title text={product.name} />
  <Meta name="description" content={product.blurb} />
  <Link rel="canonical" href={'/p/' + product.slug} />
  <Script type="application/ld+json" json={productSchema} />
</Head>
```

`<Head>` is the only component. The outermost one owns the merge; every block
below it is grouping, and where those sit carries no meaning, so two blocks merge
whether one contains the other or they are siblings in unrelated components. The
outer one has to exist because a string renderer emits in document order and the
merge must see every registration first. `<Seo>` takes the same information as a
single object and fills in Open Graph and Twitter from `title`/`description`.

Registrations are keyed by identity and the **last** one wins, so a page
overrides an app default. That inversion is the point: the platform resolves
duplicates by taking the *first* in tree order, while authoring order puts
defaults first, so appending both would let the generic value win every time.

Metadata registers during render rather than in an effect, because effects never
run on the server and an effect-based approach hands crawlers nothing. On the
client the server's elements are adopted rather than duplicated, updated in
place, and removed when their page unmounts, so navigation cannot accumulate
stale canonicals or `og:image` tags. Misuse is loud: a tag with no `<Head>` above
it throws, and two `<Head>` elements where neither contains the other are
reported in development, since that arrangement makes one of them ineffective.
