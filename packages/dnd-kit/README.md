# `@octanejs/dnd-kit`

The modern dnd-kit React adapter ported to octane. It reuses dnd-kit's
framework-agnostic `@dnd-kit/dom` implementation, so sensors, collision
detection, modifiers, accessibility, feedback, and sortable mechanics stay
on the official upstream core.

```tsrx
import { DragDropProvider } from '@octanejs/dnd-kit';
import { useSortable } from '@octanejs/dnd-kit/sortable';
import { arrayMove } from '@dnd-kit/helpers';
import { useState } from 'octane';

function Item(props) @{
  const { ref, isDragging } = useSortable({ id: props.id, index: props.index });
  <button ref={ref} data-dragging={isDragging}>{props.id as string}</button>
}

export function App() @{
  const [items, setItems] = useState(['a', 'b', 'c']);
  <DragDropProvider
    onDragEnd={(event) => {
      if (event.canceled || !event.operation.target) return;
      const from = items.indexOf(event.operation.source.id as string);
      const to = items.indexOf(event.operation.target.id as string);
      setItems(arrayMove(items, from, to));
    }}
  >
    @for (const id of items; key id) {
      <Item id={id} index={items.indexOf(id)} />
    }
  </DragDropProvider>
}
```

The public entry points mirror `@dnd-kit/react@0.5.0`:

- `@octanejs/dnd-kit`
- `@octanejs/dnd-kit/hooks`
- `@octanejs/dnd-kit/sortable`
- `@octanejs/dnd-kit/utilities`

This package targets the modern dnd-kit API. The legacy `@dnd-kit/core` 6.x
API is not included.
