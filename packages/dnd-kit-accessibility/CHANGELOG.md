# @octanejs/dnd-kit-accessibility

## 0.0.1

### Patch Changes

- d6f5536: Add Octane ports of the legacy dnd kit API, one package per upstream package: `@octanejs/dnd-kit-core` (`@dnd-kit/core` 6.3.1), `@octanejs/dnd-kit-sortable` (`@dnd-kit/sortable` 10.0.0), `@octanejs/dnd-kit-modifiers` (`@dnd-kit/modifiers` 9.0.0), `@octanejs/dnd-kit-utilities` (`@dnd-kit/utilities` 3.2.2), and `@octanejs/dnd-kit-accessibility` (`@dnd-kit/accessibility` 3.1.1). They cover `DndContext`, `DragOverlay`, `useDraggable`/`useDroppable`, the sensors and collision algorithms, `SortableContext`/`useSortable` with the sorting strategies and `arrayMove`, the `restrictTo*` and snap modifiers, and the `CSS`/DOM helpers. One difference from React: sensor activator handlers receive the native DOM event, because Octane has no synthetic events.

  The binding catalog maps each `@dnd-kit/*` package to its port, so `@octanejs/codemod` and `octane bindings` resolve them.
