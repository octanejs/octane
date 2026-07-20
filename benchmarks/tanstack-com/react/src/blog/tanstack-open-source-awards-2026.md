---
title: TanStack Start and TanStack AI Win 2026 Open Source Awards
published: 2026-06-22
excerpt: TanStack Start won Breakthrough of the Year and TanStack AI won AI Project of the Year at the 2026 Open Source Awards in Amsterdam.
library: start, ai
authors:
  - Tanner Linsley
---

![JavaScript Open Source Awards 2026](/blog-assets/tanstack-open-source-awards-2026/header.jpg)

TanStack came home from the 2026 [Open Source Awards](https://osawards.com/) with two wins. [TanStack Start](/start) won **[Breakthrough of the Year](https://x.com/schanuelmiller/status/2065335239480660421)**, and [TanStack AI](/ai) won **[AI Project of the Year](https://www.linkedin.com/posts/alem-tuzlak_i-just-won-an-award-at-jsnation-for-the-ai-activity-7470863769561206784-eHNl)**.

The awards were part of the [JSNation](https://jsnation.com/) and [React Summit](https://reactsummit.com/) week in Amsterdam, with JSNation hosting the 7th annual [JavaScript Open Source Awards](https://osawards.com/javascript/) on June 11, 2026 and React Summit happening the next day. The awards page describes the work as celebrating community success and highlighting impactful open source projects, and JSNation frames the goal even more directly: shine a light on great open source work that doesn't always get enough attention in a loud ecosystem.

That part means a lot to us, because those are the conditions TanStack has always lived in. We don't have a giant product company behind the roadmap. We have maintainers, contributors, sponsors, stubborn opinions about the open web, and a community that keeps pushing the work into real production apps.

## Start won for the hard middle of React apps

Start being named Breakthrough of the Year feels especially good because full-stack React is a crowded category, and it would have been easy for Start to look like a strange bet from the outside.

The bet was that Router's type-safe route model was already the right foundation, and that a framework should add the server layer around it instead of replacing it with magic. Start keeps routes, search params, loaders, pending states, links, and navigation grounded in TanStack Router, then adds full-document SSR, streaming, server functions, server routes, bundling, and deployable output.

That's a lot of surface area, but the point has stayed simple. You should be able to build a React app that can grow from SPA to SSR to server-heavy workflows without changing the mental model every time the app crosses a boundary.

This award lands after years of work from the Start maintainers and contributors, and after a stretch where Start has kept getting more real: [first-class Rsbuild support](/blog/start-adds-rsbuild-support), [major SSR throughput work](/blog/tanstack-start-5x-ssr-throughput), [experimental RSC work](/blog/react-server-components), and more teams using it outside of demos.

## AI won because portability still matters

TanStack AI winning AI Project of the Year hits a different nerve. The AI tooling market is moving fast, and many SDKs accidentally make the same trade: first you choose the provider, then the app architecture starts bending around that provider.

TanStack AI is our refusal to do that. It's a TypeScript-first, framework-agnostic, provider-agnostic SDK with typed tools, streaming UI, structured output, media and realtime primitives, middleware, orchestration, and an AG-UI-native wire story that doesn't force your app through a hosted gateway.

[Alem Tuzlak](https://gitnation.com/person/alem_tuzlak) was at JSNation teaching a [TanStack AI workshop](https://gitnation.com/contents/building-ai-powered-apps-with-tanstack-ai-from-setup-to-chat-tools) and giving a talk on [how we used AI to build TanStack AI](https://gitnation.com/contents/how-we-used-ai-to-build-tanstack-ai), which made the timing especially surreal. Two days before the JavaScript ceremony, we published the [TanStack AI Beta](/blog/tanstack-ai-beta), with every major modality, stable protocol work, provider adapters, and 265 E2E tests across 10 providers. That was the version we finally felt comfortable telling teams to build real products on.

Winning the AI category that same week was a useful external signal that the open, portable path still matters. Maybe more now than before.

## The ecosystem showed up

Other projects announced as winners included TypeGPU, Biome, ZurichJS, Popcorn, and React Doctor. That list says a lot about where the ecosystem is right now: better foundations, sharper tools, stronger community work, stranger experiments, and AI tooling that developers can actually inspect.

Thank you to JSNation, React Summit, GitNation, the Open Source Awards committee, everyone who nominated or voted, and every contributor who has touched Start or AI. Awards don't write code, triage issues, answer Discord threads, or keep APIs honest, but they do mark the moments where a community can look around and say, "yeah, this work is landing."

We feel that. Now back to shipping.
