---
title: 'We Removed React Server Components from TanStack.com'
published: 2026-06-23
draft: true
excerpt: React Server Components solved a real performance problem for tanstack.com, but once our markdown and highlighting stack got small, we were left with a set of runtime and code-shape tradeoffs we didn't want anymore.
library: start
authors:
  - Tanner Linsley
---

Earlier this year, tanstack.com became one of my favorite examples for React Server Components. Our content-heavy pages were shipping a giant markdown and syntax highlighting stack to the browser, we moved that work to the server, a meaningful amount of JavaScript disappeared, and the site got faster. We wrote about it, measured it, and felt pretty good about the result because it was exactly the kind of problem RSC is supposed to solve.

The performance win was real, but after living with the architecture for a while, I kept noticing how long it took to explain what should have been a pretty boring content pipeline.

Markdown became JSX in server-only files, JSX became a Flight payload, route code received `contentRsc`, and every change had to understand which side of the runtime boundary it was allowed to touch. The RSC APIs themselves did what we asked them to do, but the code around them kept collecting context, bundler configuration, dependency resolution, manual chunking, serialization boundaries, special files, and values that stopped looking like content by the time they reached the route.

That was still a reasonable trade when the alternative was shipping Shiki and our old markdown stack to every docs reader, but it also left me wondering whether RSC was solving a hard application problem or mostly keeping a needlessly large dependency out of the browser.

## RSC solved the problem we actually had

The first performance pass came after we removed third-party ads from tanstack.com. Once the ad stack was gone, the remaining first-party cost was much easier to see, and docs were the obvious problem.

At the time, one docs page was transferring about **1.1 MiB** of script, with about **358 KiB** clearly tied to syntax highlighting alone, mostly Shiki, its runtime pieces, themes, and language chunks. Markdown was still in the client path too, so the browser was basically downloading a small publishing system just to read the docs.

RSC fixed that in the most direct way possible, render markdown and highlighted code on the server, send the result to the client as Flight data, and stop shipping the big renderer to every reader.

The client bundle changes from that first move were substantial:

| Page type          | Client JS graph change |
| ------------------ | ---------------------: |
| Blog post pages    |        -153 KB gzipped |
| Docs pages         |        -153 KB gzipped |
| Docs example pages |         -40 KB gzipped |

The production pages moved too. `/blog/react-server-components` went from **52 to 74** in Lighthouse, Total Blocking Time dropped from **1,200ms to 260ms**, and transfer size dropped from **1,101 KiB to 785 KiB**. `/router/latest/docs/overview` went from **78 to 81**, TBT dropped from **280ms to 200ms**, and transfer size dropped from **917 KiB to 777 KiB**.

I don't want to rewrite that history to make the rest of this post cleaner. RSC worked, heavy client code stopped shipping to the client, and the browser had less to do, but once we saw how much of the win came from markdown and syntax highlighting, a more obvious question started bothering me.

Why did rendering markdown and highlighting code need **358 KiB** in the first place?

RSC gave us a good way to keep that cost out of the browser, but it didn't make the underlying renderer any smaller. We still had a huge general-purpose content stack, and now we also had an architecture built around keeping it on the server. If we could make that stack small enough to ship, would we still choose RSC?

Would anyone?

I knew tanstack.com couldn't answer that for every app, and I'm still happy to be proven wrong, but it felt pretty existential at the time. Once you strip away the routing, data loading, and colocation story that tends to get bundled into RSC, the concrete technical benefit I kept coming back to was much simpler, server components can use logic and dependencies that never ship to the browser. That matters a ton when the dependency is a giant markdown and syntax highlighting stack. I was having a harder time finding places where it mattered enough to justify the same machinery without one.

So we decided to find out whether the huge dependency was the use case.

## We made the expensive part small

We replaced the old stack with `@tanstack/markdown` and `@tanstack/highlight`, small packages built around the exact markdown and code rendering contract tanstack.com needs. We stopped depending on a general-purpose highlighting engine for a site that mostly needs predictable docs code blocks, stopped generating duplicate light and dark markup, stopped shipping inline token styles, and moved to class-based output with theme CSS.

The result wasn't zero JavaScript, but it was small enough that shipping it stopped feeling irresponsible. On the production routes we measured, the explicit markdown and code renderer is about **27 KiB transferred**, roughly **18 to 19 KiB** more than the RSC version.

That's the part that changed the whole decision for me. RSC had been solving a dependency problem by turning it into an architecture decision, and once the dependency problem mostly disappeared, all of the architecture was still there waiting to be paid for.

Regular SSR could return raw markdown and source data through server functions, render it with packages we own, and keep the browser payload sane. We didn't need content to become a special serialized React value before a route could display it anymore, it could just be content again.

## We kept the performance win

We compared current production at `tanstack.com` against `old.tanstack.com`, which was still running the RSC version during the measurement window. These are direct Lighthouse CLI mobile runs against production URLs, with two-run averages from July 4, 2026.

The current site includes normal production work that landed after the old site was cut, so this isn't a perfect RSC-only lab test and I wouldn't assign every byte below to removing RSC. The question I care about is narrower, after markdown and highlighting got small and we moved content back to regular SSR, did we give up the performance win RSC had bought us?

On these routes, no.

| Page                            | Old RSC score | Current SSR score | Old TBT | Current TBT | Old bytes | Current bytes |
| ------------------------------- | ------------: | ----------------: | ------: | ----------: | --------: | ------------: |
| `/blog/react-server-components` |            76 |                67 |  139 ms |       66 ms | 1,086 KiB |       889 KiB |
| `/router/latest/docs/overview`  |            71 |                71 |  209 ms |      115 ms | 1,017 KiB |       836 KiB |

The blog Lighthouse score is lower in this run and docs are tied, so I'm not going to pretend one noisy score is a product truth. The byte and main-thread story is much clearer, the current non-RSC site is smaller and has lower Total Blocking Time on the two routes that mattered most to our original RSC story.

The payload breakdown is where the trade becomes easier to see:

| Bucket                 | Old RSC blog | Current blog | Blog delta | Old RSC docs | Current docs | Docs delta |
| ---------------------- | -----------: | -----------: | ---------: | -----------: | -----------: | ---------: |
| Document               |       99 KiB |       37 KiB |    -62 KiB |       86 KiB |       34 KiB |    -52 KiB |
| App JS/assets          |      526 KiB |      349 KiB |   -177 KiB |      543 KiB |      366 KiB |   -177 KiB |
| Markdown/code renderer |        9 KiB |       27 KiB |    +18 KiB |        8 KiB |       27 KiB |    +19 KiB |
| CSS                    |       46 KiB |       52 KiB |     +6 KiB |       46 KiB |       52 KiB |     +6 KiB |

So what are we shipping more of? About **18 to 19 KiB** of explicit markdown and code-rendering chunks, plus a few KiB of CSS. Some of the **177 KiB** app JS reduction is probably unrelated cleanup, which is why I wouldn't call that an RSC delta, but the trade we can see is already enough, moving off RSC added a small renderer bucket and current production is still smaller overall on both routes.

## Six pages changes the math

The first-load comparison is actually the least favorable way to look at the current architecture, because that's the only time the browser pays for the renderer. Every page after that tilts the trade further toward regular SSR.

In the RSC version, every new piece of server-backed content came with the rendered Flight payload for that content. We kept the renderer itself out of the browser, but each navigation, refetch, or new server data value could make us pay for its serialized component tree again.

The regular SSR version pays for a tiny renderer once, then server functions only send the content data that changed. A docs request sends markdown, an example request sends source data, and the client already knows how to render both. We aren't retransferring the rendered component tree every time someone moves around the site.

Local production payload checks showed that direction pretty clearly:

| Payload                      | RSC gzip | SSR gzip |   Delta |
| ---------------------------- | -------: | -------: | ------: |
| Query landing code example   |   4.6 KB |   0.0 KB | -4.6 KB |
| Router docs overview content |   5.2 KB |   3.7 KB | -1.5 KB |
| Router example initial file  |   5.6 KB |   1.5 KB | -4.1 KB |
| Heavy blog post content      |  15.0 KB |   9.4 KB | -5.6 KB |

Our average visitor hits about six pages per session, so the first-load renderer cost is usually paid once while the payload savings keep showing up. The examples above save between **1.5 and 5.6 KB** every time that content is requested, and a page can request more than one server data value. By the sixth page, the renderer cost is old news while the RSC version would've kept sending rendered Flight payloads along the way.

That is a much bigger part of this trade than we gave it credit for the first time around. RSC turned a reusable client dependency into recurring serialized output, which made sense when the reusable dependency was enormous, but once we got it down to a few dozen KiB, paying once and sending only the data changes fit our traffic much better.

## The code kept telling us the same thing

There was one question I kept using to test the architecture, where does markdown become something React can render?

The RSC answer started in `fetchDocs` or `fetchBlogPost`, moved through `renderMarkdownToRsc`, rendered markdown into JSX in `processor.rsc.tsx`, wrapped that JSX in a fragment in `renderRsc.tsx`, called `renderServerComponent`, serialized the result, and eventually arrived at the route as `contentRsc`.

The important part looked like this:

```tsx
import { renderServerComponent } from '@tanstack/react-start/rsc'
import * as React from 'react'
import { renderMarkdownToJsx } from './processor.rsc'

export async function renderMarkdownToRsc(content: string) {
  const { content: contentJsx, headings } = await renderMarkdownToJsx(content)
  const contentRsc = await renderServerComponent(
    React.createElement(React.Fragment, null, contentJsx),
  )

  return {
    contentRsc,
    headings,
  }
}
```

There's nothing offensive about that function, and none of this is an indictment of the TanStack Start RSC setup or helper APIs. They did what we asked them to do. The problem was the shape that accumulated around the boundary, route components received `contentRsc: React.ReactNode`, the place displaying markdown no longer explained how markdown became markup, and every human or coding agent working in that path had to know which files were normal React, which were server-only React, which values were raw content, which were Flight payloads, and which component tree only existed after serialization.

That context isn't impossible to learn, but it made ordinary work feel oddly expensive. A content change could turn into a dependency graph question, a component change could turn into a server-boundary question, and bundler behavior was never very far away. None of those things were outrageous on their own, there were just too many of them for a markdown pipeline that no longer needed to hide a huge dependency.

The migration commit, `92b1c481`, removed or renamed the whole content-specific RSC path:

- `src/utils/markdown/processor.rsc.tsx`
- `src/utils/markdown/renderRsc.tsx`
- `src/components/markdown/CodeBlock.server.tsx`
- `src/components/markdown/renderCodeBlock.server.tsx`
- `src/utils/landing-code-example.functions.ts`
- `src/components/landing/LandingCodeExampleCard.server.tsx`
- `src/components/landing/codeExamples.server.tsx`
- `src/components/markdown/MarkdownHeadingContext.tsx`

The deletions split between the RSC-specific content path and the old rendering plugins:

| Removed code                   | Files | Lines removed |
| ------------------------------ | ----: | ------------: |
| RSC-specific content plumbing  |     9 |           555 |
| Old markdown/rendering plugins |     8 |           994 |

The content path became boring again. Server functions return content data, `MarkdownContent` receives a markdown document and renders a normal `Markdown` component, landing examples are component data, and below-fold media-heavy sections still use targeted `Hydrate` timing so the browser doesn't eagerly schedule too much work on the first load.

The browser is doing a little more rendering work now, and that's a trade I'm happy to make because the amount is small, predictable, and reused. In return, the data moving through the app looks like the source material again, the route explains what it renders, and opening one file doesn't require a mental model of the whole bundler.

## RSC stopped earning its keep

I don't think our first RSC move was fake or misguided, it solved the problem we had at the time and gave us a very real performance win. I'm also not trying to prove that regular SSR beats RSC everywhere, because two production routes on one site couldn't prove that even if I wanted them to.

I also came away more skeptical of the broader RSC pitch. React core and Next.js tend to wrap server components in a much bigger story about routing, data loading, and colocation, but none of those things were what made RSC valuable here. The technical benefit we could actually point to was keeping expensive component logic and dependencies on the server and out of the client bundle, and that matters a ton for giant renderers, parsers, highlighters, formatters, and content pipelines.

Maybe there are many more use cases where that benefit justifies the machinery and we haven't run into them yet. I'm happy to be proven wrong, but our strongest RSC use case disappeared as soon as the dependency got small, and I don't think that's nothing.

For us, RSC bought relief from a huge markdown and highlighting stack, then that stack stopped being huge and we were left paying for runtime boundaries, bundler context, serialization, special files, and a content path that was harder for humans and coding agents to follow. The standard APIs weren't bad, the architecture just stopped earning its keep.

## Supporting RSC is different from requiring it

I don't want this post to flatten the amount of work behind TanStack Start's RSC support either. Manuel did a significant amount of difficult framework and bundler work to make Flight streams usable without forcing the rest of your application to orbit them, and we're going to keep supporting that work.

The fact that RSC is opt-in is what makes this decision so uneventful. Tanstack.com can stop using it without TanStack Start removing the capability, changing direction, or asking every other Start user to agree with us.

RSC support has also become something of an ecosystem checkbox. Next.js made RSC foundational to its current architecture, so people ask whether a framework supports RSC long before they can describe the problem they expect RSC to solve. I suspect most applications don't need them today, but developers still want to know the door is open, and that's fair.

I also have no idea whether RSC will remain the primitive that fills this role forever. Better framework primitives may eventually cover enough of the same ground. Flight or something like it might become framework-agnostic, move closer to the platform, or matter a lot less in a future where React isn't the center of the frontend universe. Gasp.

We don't need to predict that future to make a good decision now. Start can support RSC as an optional capability without treating it as the required center of every application. Honestly, the best evidence of Manuel's work may be that TanStack Start can keep supporting RSC while tanstack.com removes it, and neither choice has to compromise the other.

Regular SSR is the boring answer again, and it fits tanstack.com better. The renderer is tiny, the first load is still smaller overall on the routes we measured, the next five pages send changed content data instead of fresh rendered Flight payloads, and the code explains itself when you open the route.

I can imagine using RSC again when the server boundary is doing enough work to deserve being part of the application model, but I don't want to reach for an architecture to hide a dependency problem anymore. I'd rather make the dependency small and let content be content.
