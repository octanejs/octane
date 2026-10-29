# `@octanejs/dnd-kit-core`

The legacy dnd kit drag-and-drop toolkit for Octane: `DndContext`, `DragOverlay`,
`useDraggable`, `useDroppable`, sensors, collision detection, modifiers, and
screen-reader announcements, ported from `@dnd-kit/core` 6.3.1.

## Installation

```sh
npm install @octanejs/dnd-kit-core octane
pnpm add @octanejs/dnd-kit-core octane
```

Replace imports from `@dnd-kit/core` with `@octanejs/dnd-kit-core`;
[`@octanejs/codemod`](../codemod) rewrites them for you.

## Usage

The example also uses `CSS` from `@octanejs/dnd-kit-utilities`, which you can
install alongside it.

```tsrx
import { DndContext, useDraggable, useDroppable } from '@octanejs/dnd-kit-core';
import { CSS } from '@octanejs/dnd-kit-utilities';
import { useState } from 'octane';

function Card() @{
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: 'card' });
  <button
    ref={setNodeRef}
    style={{ transform: CSS.Translate.toString(transform) }}
    {...listeners}
    {...attributes}
  >
    Drag me
  </button>
}

function Zone(props: { dropped: boolean }) @{
  const { isOver, setNodeRef } = useDroppable({ id: 'zone' });
  <section ref={setNodeRef} data-over={String(isOver)}>
    @if (props.dropped) {
      <Card />
    } @else {
      <p>Drop here</p>
    }
  </section>
}

export function App() @{
  const [dropped, setDropped] = useState(false);
  <DndContext onDragEnd={(event) => setDropped(event.over?.id === 'zone')}>
    @if (!dropped) {
      <Card />
    }
    <Zone dropped={dropped} />
  </DndContext>
}
```

## Differences from `@dnd-kit/core`

Octane has no synthetic event layer, so a sensor's activator handler receives
the native DOM event. The built-in sensors read it directly. A custom sensor
written for React that destructures `{ nativeEvent }` should read the event
itself instead:

```ts
static activators = [
  {
    eventName: 'onPointerDown' as const,
    handler: (event: PointerEvent) => event.isPrimary && event.button === 0,
  },
];
```

## About this port

This package is part of Octane's port of the legacy dnd kit API, the
`@dnd-kit/core` 6.x family: `@octanejs/dnd-kit-core`, `@octanejs/dnd-kit-sortable`,
`@octanejs/dnd-kit-modifiers`, `@octanejs/dnd-kit-utilities`, and
`@octanejs/dnd-kit-accessibility`, one per upstream package. For the modern
`@dnd-kit/react` API, use [`@octanejs/dnd-kit`](../dnd-kit).

Parity is `recorded-unverified`. Upstream's own unit tests are placeholders, so
each package runs them pristine and adapted, and a repo-authored differential test
runs the same fixtures against the published React package and compares the DOM
after every drag step. See [`UPSTREAM.md`](./UPSTREAM.md) for the pin and the
evidence.
