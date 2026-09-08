# `useStickToBottom`

> Designed with AI chat bots in mind

[![npm downloads](https://www.shieldcn.dev/npm/dm/use-stick-to-bottom.svg?variant=branded&size=sm)](https://www.npmjs.com/package/use-stick-to-bottom)
[![Total npm downloads](https://www.shieldcn.dev/npm/dw/use-stick-to-bottom.svg?variant=secondary&size=sm)](https://www.npmjs.com/package/use-stick-to-bottom)
[![@samdenty on X](https://www.shieldcn.dev/x/follow/samdenty.svg?variant=branded&size=sm)](https://x.com/samdenty)

**If you or your company finds this hook useful [Sponsor me on GitHub](https://github.com/sponsors/samdenty)**

A lightweight **zero-dependency** React hook + Component that automatically sticks to the bottom of container and smoothly animates the content to keep it's visual position on screen whilst new content is being added.

## Features

- Does not require [`overflow-anchor`](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor) browser-level CSS support which Safari does not support.
- Can be connected up to any existing component using a hook with refs. Or simply use the provided component, which handles the refs for you plus provides context - so child components can check `isAtBottom` & programmatically scroll to the bottom.
- Uses the modern, yet well-supported, [`ResizeObserver`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) API to detect when content resizes.
  - Supports content shrinking without losing stickiness - not just getting taller.
- Correctly handles [Scroll Anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor/Guide_to_scroll_anchoring). This is where when content above the viewport resizes, it doesn't cause the content currently displayed in viewport to jump up or down.
- Allows the user to cancel the stickiness at any time by scrolling up.
  - Clever logic distinguishes the user scrolling from the custom animation scroll events (without doing any debouncing which could cause some events to be missed).
  - Mobile devices work well with this logic too.
- Uses a custom implemented smooth scrolling algorithm, featuring velocity-based spring animations (with configurable parameters).
  - Other libraries use easing functions with durations instead, but these doesn't work well when you want to stream in new content with variable sizing - which is common for AI chatbot use cases.
  - `scrollToBottom` returns a `Promise<boolean>` which will resolve to `true` as soon as the scroll was successful, or `false` if the scroll was cancelled.

## Installation

```bash
npm install use-stick-to-bottom
```

## Usage

### `<StickToBottom>` Component

```jsx
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

function Chat() {
  return (
    <StickToBottom className="h-[50vh] relative" resize="smooth" initial="smooth">
      <StickToBottom.Content className="flex flex-col gap-4">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </StickToBottom.Content>

      <ScrollToBottom />

      {/* This component uses `useStickToBottomContext` to scroll to bottom when the user enters a message */}
      <ChatBox />
    </StickToBottom>
  );
}

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <button
        className="absolute i-ph-arrow-circle-down-fill text-4xl rounded-lg left-[50%] translate-x-[-50%] bottom-0"
        onClick={() => scrollToBottom()}
      />
    )
  );
}
```

### `useStickToBottom` Hook

```jsx
import { useStickToBottom } from 'use-stick-to-bottom';

function Component() {
  const { scrollRef, contentRef } = useStickToBottom();

  return (
    <div style={{ overflow: 'auto' }} ref={scrollRef}>
      <div ref={contentRef}>
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}
```
