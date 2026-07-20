---
title: Chat UIs Are Lists Until They Aren't
published: 2026-05-25
excerpt: Chat, AI streams, and logs don't behave like ordinary lists. TanStack Virtual now supports end-anchored virtualization for prepend-stable history, append-follow, and streaming output that stays pinned.
library: virtual
authors:
  - Tanner Linsley
---

In the last TanStack Virtual release, I left one thing on the table: reverse infinite scroll for chat, and it deserved its own pass.

Chat used to be a niche UI, now it's everywhere, in support inboxes, activity logs, multiplayer feeds, copilots, AI agents, and streaming assistants. They all look like lists, but they don't behave like the lists virtualization libraries were originally built around.

A normal virtual list is start-anchored, so the top of the content is the stable point. You scroll down, append more rows, measure dynamic heights, and everything mostly works.

Chat flips that contract.

- New output appears at the end.
- Older history loads by prepending items at the start.
- The last message can grow token by token while the model is streaming.
- The user should only follow new output if they were already at the latest message.

That last part matters. If someone scrolls up to read history, incoming messages shouldn't yank them back to the bottom, and if they're already there, the UI should stay pinned without every app rewriting the same scroll math.

TanStack Virtual now has a first-class way to model that.

```tsx
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 72,
  getItemKey: (index) => messages[index]!.id,
  anchorTo: 'end',
  followOnAppend: true,
  scrollEndThreshold: 80,
})
```

## End anchoring

`anchorTo: 'end'` tells the virtualizer that the end of the list is the edge you want to preserve.

When you prepend older messages, TanStack Virtual captures the currently visible item, finds the same keyed item after the data changes, and adjusts the scroll offset so it stays in the same visual position.

That means no `column-reverse`, no inverted transforms, and no manual `scrollTop += delta` bookkeeping in every app. Just normal data:

```tsx
setMessages((current) => [...olderMessages, ...current])
```

The only real requirement is a stable key:

```tsx
getItemKey: (index) => messages[index]!.id
```

Index keys can't make prepend stability work, because after a prepend every old item moves to a new index, and the virtualizer needs to know which message is still the same message.

## Follow only when pinned

`followOnAppend` handles the "stay at latest, unless I am reading history" rule.

If the user is already near the end, appended messages keep the viewport pinned, and if they've scrolled up, new output lands below without stealing their place.

```tsx
followOnAppend: true
```

You can also pass a scroll behavior:

```tsx
followOnAppend: 'smooth'
```

The threshold is configurable too:

```tsx
scrollEndThreshold: 80
```

That same end-state logic is exposed for UI:

```tsx
virtualizer.isAtEnd()
virtualizer.getDistanceFromEnd()
virtualizer.scrollToEnd()
```

So your "Jump to latest" button can use the same rules as the virtualizer itself.

## Streaming output

The modern version of chat isn't append-a-message, it's append a message and then resize it dozens or hundreds of times while tokens stream in.

Without end anchoring, the scroll height grows but the scroll offset doesn't, so the user slowly drifts away from the bottom.

With `anchorTo: 'end'`, if the viewport was pinned before the last item grew, TanStack Virtual applies the size delta and keeps the end pinned.

That's the point of this feature: the common chat behaviors aren't userland chores anymore.

## Still headless

This still isn't a chat component.

TanStack Virtual still doesn't render bubbles, loaders, timestamps, avatars, unread dividers, or composer UI. That part belongs to your app.

What it does now is handle the scroll physics that almost every chat UI needs:

- stable prepends
- conditional append-follow
- pinned streaming growth
- end-distance helpers

It's a small API with a pretty big ergonomic win.

There is also a new [Chat guide](/virtual/latest/docs/chat) and a [React chat example](/virtual/latest/docs/framework/react/examples/chat) showing history prepends, appended messages, streaming replies, and a "Latest" control built with `scrollToEnd()`.

Chat is one of the dominant UI patterns of modern apps now, and TanStack Virtual should make it feel boring to build.
