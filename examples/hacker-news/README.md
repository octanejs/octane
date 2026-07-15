# Hacker News — one reader, built twice

A small [Hacker News](https://news.ycombinator.com/) reader (top stories, story +
comments, user profiles) built **twice** over a single shared
[octane](../../README.md) core:

- **`jsx/`** — the views authored in React-style `.tsx`.
- **`tsrx/`** — the same views authored in `.tsrx` (octane's directive syntax).

Everything _except_ the view components is shared verbatim. The point of the
example is that octane's React-JSX backwards-compatibility lets the exact same
app — same router, same data layer, same Suspense boundaries, same styling, same
DOM and same behavior — be written in either dialect. The
[Playwright spec](#parity-proof) proves it: the same test file passes against both
apps.

## Stack

- **[@octanejs/tanstack-router](../../packages/tanstack-router)** — `Link` / `Outlet` /
  `useParams`; concurrent navigation driven by transitions.
- **[@octanejs/tanstack-query](../../packages/tanstack-query)** — `useSuspenseQuery` over plain
  query-option factories.
- **[octane](../../packages/octane) Suspense** — route-level pending skeletons,
  dependent feed/page queries, and isolated recursive comment boundaries.
- **[@octanejs/stylex](../../packages/stylex)** — compiled atomic CSS.

Routes: `/` (top stories), `/newest` / `/ask` / `/show` / `/jobs` (the other HN
feeds), `/item/$id` (a story + its comment tree), `/user/$id` (a profile). The
interactive example uses the public HN Firebase API by default. Playwright
overrides `VITE_HN_API_BASE` with a deterministic local fixture API, so browser
and server-rendering tests never require internet access.

## Feeds

The orange header nav works. The four feed words map to **real internal feed
routes** that all render the same `StoriesPage` over a different HN feed endpoint:

| nav    | route     | HN feed endpoint       |
| ------ | --------- | ---------------------- |
| (logo) | `/`       | `/v0/topstories.json`  |
| new    | `/newest` | `/v0/newstories.json`  |
| ask    | `/ask`    | `/v0/askstories.json`  |
| show   | `/show`   | `/v0/showstories.json` |
| jobs   | `/jobs`   | `/v0/jobstories.json`  |

`StoriesPage` derives its feed from the active pathname (`feedForPath`) and reads
`storiesQuery(feed)`, so a single page component serves every feed route. The
nav link for the current feed is highlighted (bold + underlined) by comparing the
active pathname to each link's target; the router `<Link>` also sets
`aria-current="page"` / `data-status="active"` on the exact match.

## Run it

```bash
pnpm dev            # the .tsrx app, SSR + hydrate -> http://localhost:5170
pnpm dev:jsx        # the React-style .tsx app, SSR + hydrate
pnpm dev:tsrx       # the .tsrx app, SSR + hydrate
pnpm typecheck      # strict TypeScript check for shared, JSX, glue, and E2E code
pnpm build          # production client builds for both authoring dialects
pnpm test:e2e       # build + Playwright parity/SSR journeys for both apps
pnpm test:e2e:dev   # optional fast pass from source-serving Vite clients
```

The two E2E commands use POSIX inline environment syntax and are supported on
macOS/Linux (CI runs Ubuntu). The ordinary `dev`, `typecheck`, and `build`
commands do not require that launcher syntax.

`pnpm test:e2e` boots a local HN-compatible fixture API on `:5190`, each app's
production client build through Vite preview (`:5191` JSX, `:5192` TSRX), and
both source-driven SSR servers (`:5193` JSX, `:5194` TSRX). The fixture base is
baked into the production clients before Playwright starts. The same data drives
browser and Node SSR fetches, so no external API or manually started server is
required. The SSR servers use Vite middleware for source loading but set
`NODE_ENV=production`, keeping this release gate on production runtime behavior.
The fast E2E variant serves client modules from source but keeps the same
production runtime semantics and strict diagnostic gate. `pnpm e2e` remains as
a convenience alias.

## SSR & hydration

Both apps server-render and hydrate — the React-style `.tsx` app and the `.tsrx`
app, over the same octane core. `server.mjs` is one dev SSR server for both (Vite
in middleware mode); per request it:

1. builds a fresh server router (memory history at the request URL, `isServer`)
   and `router.load()`s it — the route loaders prefetch that route's queries into
   a per-request `QueryClient` (so render reads a warm cache, no in-render fetch);
2. `await render(<App router queryClient/>)` from `octane/server` — octane's async
   render resolves the route's `useSuspenseQuery` data into the HTML (bounded by
   the suspense timeout), returning `{ head, body, css }`;
3. `dehydrate(queryClient)` and inlines it as `#__octane_data`;
4. splices `head`/`css`/`body`/data into `index.html` and sends it.

The client (`entry-client.tsx`) reads `#__octane_data`, seeds the query cache
(`hydrate`), waits for the router matches to commit, then `hydrateRoot(container,
<App router queryClient/>)` — adopting the server DOM with no refetch and no
`@pending` flash. **The client hydrates the SAME `<App>` tree the server rendered**
— rendering the inner `<QueryClientProvider><RouterProvider/>` directly would drop
a component layer and desync the hydration cursor.

The StyleX atomic sheet is inlined into the SSR `<head>` (via the plugin's
`api.getCss()`) so the **first paint is styled** — in dev, `virtual:stylex.css` is
served as JS that injects styles only after the client runs, which would otherwise
flash unstyled content.

With JavaScript disabled the page is still a complete, server-rendered, **styled**
story list (that's what `ssr.spec.ts` asserts). Limitations: no streaming (the whole
document is buffered, Suspense resolved before the first byte), and `<head>`/`<title>`
are set by the shell, not per route.

## Shared core vs. view-only split

```
shared/        # IDENTICAL for both apps — the entire "core"
  api.ts       #   HN API client: topStories(), item(id), user(id)
  types.ts     #   API shapes
  format.ts    #   relativeTime / hostname / pluralize
  queries.ts   #   @octanejs/tanstack-query option factories
  styles.ts    #   StyleX styles
  routes.ts    #   createAppRouter(views) — the route tree / paths / params

jsx/           # ONLY the views differ between the two apps...
  *.tsx        #   React-style views + queryClient + routes wiring
tsrx/
  *.tsrx       #   the same views in .tsrx directive syntax

e2e/
  fixtures/    #   fixed feed, item, comment, and user data
  fixture-server.mjs # local HN-compatible API used by browser and Node SSR
  *.spec.ts    #   parity, pagination, SSR, hydration, and interaction journeys
```

`shared/routes.ts` exposes `createAppRouter(components)`; each app passes its own
view components and gets back an identical router. So the _only_ thing that varies
between `jsx/` and `tsrx/` is how each view is written — the data flow, the route
structure, and the emitted DOM are the same.

## `.tsx` vs `.tsrx`, side by side

The same `StoryRow`, in both dialects. They compile to identical output and emit
identical DOM — including the same `data-testid="story-row"` and the same
`/item/$id` and `/user/$id` links the e2e suite drives.

```tsx
// jsx/StoryRow.tsx (React-style)
export function StoryRow({ rank, story }: { rank: number; story: Story }) {
	const host = hostname(story.url);
	return (
		<div data-testid="story-row">
			<div {...stylex.props(styles.row)}>
				<span {...stylex.props(styles.rank)}>{rank}.</span>
				{story.url ? (
					<a href={story.url} className="story-title" {...stylex.props(styles.titleLink)}>
						{story.title}
					</a>
				) : (
					<Link
						to="/item/$id"
						params={{ id: String(story.id) }}
						className="story-title"
						{...stylex.props(styles.titleLink)}
					>
						{story.title}
					</Link>
				)}
				{host && <span {...stylex.props(styles.host)}>({host})</span>}
			</div>
			{/* ...meta: score, author Link, comments Link... */}
		</div>
	);
}
```

```tsx
// tsrx/StoryRow.tsrx (directive syntax) — note `@{ … }`, `@if/@else`, `class`,
// and the `as string` text casts
export function StoryRow({ rank, story }: { rank: number; story: Story }) @{
	const host = hostname(story.url);

	<div data-testid="story-row">
		<div {...stylex.props(styles.row)}>
			<span {...stylex.props(styles.rank)}>{rank + '.' as string}</span>
			@if (story.url) {
				<a href={story.url} class="story-title" {...stylex.props(styles.titleLink)}>
					{story.title as string}
				</a>
			} @else {
				<Link
					to="/item/$id"
					params={{ id: String(story.id) }}
					class="story-title"
					{...stylex.props(styles.titleLink)}
				>
					{story.title as string}
				</Link>
			}
			@if (host) {
				<span {...stylex.props(styles.host)}>{'(' + host + ')' as string}</span>
			}
		</div>
		{/* ...meta: score, author Link, comments Link... */}
	</div>
}
```

## Parity proof

`e2e/nav.spec.ts` is a single spec run once per project (`jsx` against `:5191`,
`tsrx` against `:5192`, via `e2e/playwright.config.ts`). It reads from the same
fixed fixture API as SSR, with a small artificial delay so the Suspense skeleton
is exercised, then asserts the same things in both apps:

- `/` renders the fixture stories (`[data-testid="story-row"]` count, a known
  title, an external story link with the fixture `href`);
- the pending skeleton (`[data-testid="pending"]`) shows, then resolves to rows;
- clicking a story's comments link navigates to `/item/<id>`, the header renders,
  the comments render **including their `innerHTML` bodies** (the body text and
  inline `<i>` markup), and browser Back returns to the list;
- clicking an author navigates to `/user/<id>` and the karma renders;
- the header nav links are present, and the feed links (new / ask / show / jobs)
  swap the feed, its content, and the active-link highlight;
- each feed endpoint has a distinct fixture id list, so clicking a feed link
  is verified to actually change the rendered list, not just the URL.

`page-more-hold.spec.ts` delays the second fixture page and verifies that the
first page stays visible without a pending-skeleton flash until its replacement
is ready. `ssr.spec.ts` verifies exact server HTML with JavaScript disabled,
inline first-paint styles, adoption of a server-created row, clean hydration
diagnostics, and post-hydration navigation. These journeys execute for both
authoring dialects.

Every JavaScript-enabled journey also shares one strict browser-diagnostics
gate: unexpected console errors, page errors, and hydration mismatch warnings
fail the test after the page has settled. The JavaScript-disabled SSR proof is
the sole intentional exemption.

The same assertions passing under **both** projects is the `.tsx` ≡ `.tsrx`
parity result.

```
20 passed
  [jsx]  10 passed
  [tsrx] 10 passed
```

### Notes on selectors

The story links intentionally put a literal `story-title` class before a StyleX
spread; the later spread owns the effective class while normalizing its value
clsx-style. Router `<Link>`s render plain `<a href>`s. The spec deliberately
addresses links by **role / `href`** (e.g. `a[href="/item/101"]`,
`a[href="/user/alice"]`) and structural `data-testid`s
(`story-row`, `stories-page`, `item-page`, `comment`, `user-page`, `pending`) —
all identical across the two apps. No view changes were needed to test either.

The header's feed links (new / ask / show / jobs) are router `<Link>`s too, so
they likewise render plain `<a href>` (and drop `data-testid`); the spec addresses
them by `href` (`a[href="/newest"]`) and reads the active state from the
`aria-current="page"` / `data-status="active"` attributes the `Link` sets.

Comment bodies, a story's `text`, and a user's `about` are bound with
`innerHTML={…}` and render as real inner HTML — the spec asserts on a comment's
body text and its inline `<i>` markup, identically in both apps.
