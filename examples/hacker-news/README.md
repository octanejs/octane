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

- **[@octane-ts/router](../../packages/router)** — `Link` / `Outlet` /
  `useParams`; concurrent navigation driven by transitions.
- **[@octane-ts/query](../../packages/query)** — `useSuspenseQuery` over plain
  query-option factories.
- **[octane](../../packages/octane) Suspense** — each story row and each comment
  is its own Suspense unit, so a slow item never blocks the list.
- **[@octane-ts/stylex](../../packages/stylex)** — compiled atomic CSS.

Routes: `/` (top stories), `/newest` / `/ask` / `/show` / `/jobs` (the other HN
feeds), `/item/$id` (a story + its comment tree), `/user/$id` (a profile). Data
comes from the public HN Firebase API (`https://hacker-news.firebaseio.com/v0/...`).

## Feeds

The orange header nav works. The four feed words map to **real internal feed
routes** that all render the same `StoriesPage` over a different HN feed endpoint:

| nav    | route      | HN feed endpoint                 |
| ------ | ---------- | -------------------------------- |
| (logo) | `/`        | `/v0/topstories.json`            |
| new    | `/newest`  | `/v0/newstories.json`            |
| ask    | `/ask`     | `/v0/askstories.json`            |
| show   | `/show`    | `/v0/showstories.json`           |
| jobs   | `/jobs`    | `/v0/jobstories.json`            |

`StoriesPage` derives its feed from the active pathname (`feedForPath`) and reads
`storiesQuery(feed)`, so a single page component serves every feed route. The
nav link for the current feed is highlighted (bold + underlined) by comparing the
active pathname to each link's target; the router `<Link>` also sets
`aria-current="page"` / `data-status="active"` on the exact match.

## Run it

```bash
pnpm dev:jsx     # the React-style .tsx app  -> http://localhost:5173 (or next free port)
pnpm dev:tsrx    # the .tsrx app
pnpm e2e         # the Playwright nav-parity suite (boots both apps, fully offline)
```

`pnpm e2e` boots each app's Vite dev server itself (jsx on `:5191`, tsrx on
`:5192`) and stubs the HN API, so it needs no network and no servers running up
front. If you already have a dev server up locally on those ports it is reused.

## Shared core vs. view-only split

```
shared/        # IDENTICAL for both apps — the entire "core"
  api.ts       #   HN Firebase client: topStories(), item(id), user(id)
  types.ts     #   API shapes
  format.ts    #   relativeTime / hostname / pluralize
  queries.ts   #   @octane-ts/query option factories
  styles.ts    #   StyleX styles
  routes.ts    #   createAppRouter(views) — the route tree / paths / params

jsx/           # ONLY the views differ between the two apps...
  *.tsx        #   React-style views + queryClient + routes wiring
tsrx/
  *.tsrx       #   the same views in .tsrx directive syntax
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
					<a href={story.url} {...stylex.props(styles.titleLink)}>
						{story.title}
					</a>
				) : (
					<Link to="/item/$id" params={{ id: String(story.id) }} {...stylex.props(styles.titleLink)}>
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
				<a href={story.url} {...stylex.props(styles.titleLink)}>
					{story.title as string}
				</a>
			} @else {
				<Link to="/item/$id" params={{ id: String(story.id) }} {...stylex.props(styles.titleLink)}>
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
`tsrx` against `:5192`, via `e2e/playwright.config.ts`). It stubs the HN Firebase
API with tiny fixed fixtures and a small artificial delay (so the Suspense
skeleton is exercised), then asserts the same things in both apps:

- `/` renders the stubbed stories (`[data-testid="story-row"]` count, a known
  title, an external story link with the stubbed `href`);
- the pending skeleton (`[data-testid="pending"]`) shows, then resolves to rows;
- clicking a story's comments link navigates to `/item/<id>`, the header renders,
  the comments render **including their `innerHTML` bodies** (the body text and
  inline `<i>` markup), and browser Back returns to the list;
- clicking an author navigates to `/user/<id>` and the karma renders;
- the header nav links are present, and the feed links (new / ask / show / jobs)
  swap the feed, its content, and the active-link highlight;
- each feed endpoint is stubbed with a distinct id list, so clicking a feed link
  is verified to actually change the rendered list, not just the URL.

The same assertions passing under **both** projects is the `.tsx` ≡ `.tsrx`
parity result.

```
12 passed
  [jsx]  6 passed
  [tsrx] 6 passed
```

### Notes on selectors

The apps spread StyleX onto their anchors (`{...stylex.props(...)}`), which owns
the `className`, and router `<Link>`s render plain `<a href>`s. So the spec
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
