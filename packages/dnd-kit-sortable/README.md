# `@octanejs/dnd-kit-sortable`

Sortable presets for the legacy dnd kit API on Octane: `SortableContext`,
`useSortable`, sorting strategies, `arrayMove`, and keyboard sorting, ported
from `@dnd-kit/sortable` 10.0.0. It builds on `@octanejs/dnd-kit-core`.

## Installation

```sh
npm install @octanejs/dnd-kit-sortable @octanejs/dnd-kit-core octane
pnpm add @octanejs/dnd-kit-sortable @octanejs/dnd-kit-core octane
```

Replace imports from `@dnd-kit/sortable` with `@octanejs/dnd-kit-sortable`;
[`@octanejs/codemod`](../codemod) rewrites them for you.

## Usage

The example also uses `CSS` from `@octanejs/dnd-kit-utilities`, which you can
install alongside it.

```tsrx
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@octanejs/dnd-kit-core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@octanejs/dnd-kit-sortable';
import { CSS } from '@octanejs/dnd-kit-utilities';
import { useState } from 'octane';

function Row(props: { id: string }) @{
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.id });
  <li
    ref={setNodeRef}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    {...attributes}
    {...listeners}
  >
    {props.id as string}
  </li>
}

export function List() @{
  const [items, setItems] = useState(['a', 'b', 'c']);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  <DndContext
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragEnd={({ active, over }) => {
      if (over && active.id !== over.id) {
        setItems((current) =>
          arrayMove(current, current.indexOf(String(active.id)), current.indexOf(String(over.id))),
        );
      }
    }}
  >
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      <ul>
        @for (const id of items; key id) {
          <Row id={id} />
        }
      </ul>
    </SortableContext>
  </DndContext>
}
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
