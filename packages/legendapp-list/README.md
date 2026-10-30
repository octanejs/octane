# @octanejs/legendapp-list

[Legend List](https://github.com/LegendApp/legend-list) for
[Octane](https://github.com/octanejs/octane). It ports `@legendapp/list@3.3.5`'s web
entry, `@legendapp/list/react`: the virtualized `LegendList` with recycled rows,
dynamic item sizes, multiple columns, sticky headers, scroll anchoring
(`maintainVisibleContentPosition`, `maintainScrollAtEnd`, `anchoredEndSpace`),
viewability callbacks, the imperative scroll handle and the per-row hooks.

## Installation

```bash
npm install @octanejs/legendapp-list
pnpm add @octanejs/legendapp-list
```

## Usage

```tsx
import { LegendList, type LegendListRef } from '@octanejs/legendapp-list';
import { useRef } from 'octane';

interface Message {
	id: string;
	text: string;
}

export function Thread({ messages }: { messages: Message[] }) @{
	const list = useRef<LegendListRef | null>(null);
	<LegendList<Message>
		ref={list}
		data={messages}
		keyExtractor={(message) => message.id}
		renderItem={({ item }) => <p>{item.text}</p>}
		estimatedItemSize={64}
		recycleItems
		initialScrollAtEnd
		maintainScrollAtEnd
		maintainVisibleContentPosition
		style={{ height: '100%' }}
	/>
}
```

`list.current` is the same handle upstream exposes: `scrollToIndex`, `scrollToOffset`,
`scrollToEnd`, `scrollIndexIntoView`, `getState`, `getScrollableNode` and the rest.

## Migrating from `@legendapp/list/react`

Change the import to `@octanejs/legendapp-list`; `@octanejs/codemod` does this for you.
Props, callbacks, the ref handle, the hooks (`useRecyclingState`, `useRecyclingEffect`,
`useViewability`, `useViewabilityAmount`, `useIsLastItem`, `useListScrollSize`,
`useSyncLayout`, `useAdaptiveRender`, `useAdaptiveRenderChange`) and the exported types
are upstream's.

- Pass `ref` as a prop, as everywhere in Octane. Upstream's `LegendList` was a
  `forwardRef` component; its handle is unchanged.
- `onScroll`, `onLayout` and the other list callbacks receive upstream's
  React Native-shaped events (`event.nativeEvent.contentOffset`), not DOM events.
- Rows may be authored as `children` instead of `data` and `renderItem`, as upstream
  allows.

## Differences from upstream

Five hundred milliseconds after the rows last moved, Legend List sorts the row elements
into item order so that assistive technology and text selection follow the visual order.
Upstream moves the DOM nodes itself; this port renders the rows in that order and lets
Octane move them, because Octane tracks each component's DOM nodes and a node moved
behind its back would be orphaned. The DOM ends up in the same order. After such a
reorder, effects in different rows run in DOM order rather than in upstream's
container order; each row's own effects keep their order.

## Server rendering

`octane/server` renders the same markup as `@legendapp/list/react` on `react-dom/server`:
the scroll container, header, footer, empty state and snap anchors. Rows render once the
client has measured the list, as upstream.

## Parity evidence

- 1,348 of upstream's own test registrations run unchanged against React under its own
  harness, and the 1,255 cases from its core suites also run against this package's source.
- Twelve scenarios run in real Chromium against `@legendapp/list/react`: scrolling and every
  scroll method, a chat that opens at the end and follows new messages, recycled pickers,
  restored scroll positions, anchored end space, empty lists, horizontal lists, columns,
  sticky headers, snapping, children mode and the per-row hooks. Each step compares scroll
  geometry, the mounted rows and their offsets, DOM order, `getState()` and every callback.

See [UPSTREAM.md](./UPSTREAM.md) for the pin, the source crosswalk and how each upstream
case is covered.

## License

MIT. Legend List is © Moo.do LLC and MIT-licensed; its license ships as
[`LICENSE.upstream`](./LICENSE.upstream).
