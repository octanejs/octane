# @octanejs/dnd-kit-core

## 0.0.2

### Patch Changes

- Updated dependencies [bf398e2]
- Updated dependencies [cd974fa]
- Updated dependencies [61e724f]
- Updated dependencies [3c4f5ad]
- Updated dependencies [ac86023]
- Updated dependencies [3dc24cf]
- Updated dependencies [5add880]
- Updated dependencies [75bcd35]
- Updated dependencies [5af6e70]
- Updated dependencies [f925209]
- Updated dependencies [6512e48]
- Updated dependencies [4258cf5]
- Updated dependencies [343be9a]
- Updated dependencies [792af47]
- Updated dependencies [a2fa609]
- Updated dependencies [1325880]
- Updated dependencies [0fda24c]
- Updated dependencies [5a5aa6c]
- Updated dependencies [3975992]
- Updated dependencies [7db3f95]
- Updated dependencies [1868a5b]
- Updated dependencies [e821117]
- Updated dependencies [6fa5f7f]
- Updated dependencies [435bdac]
- Updated dependencies [67298b5]
- Updated dependencies [4b64604]
- Updated dependencies [b244f8c]
- Updated dependencies [c9bcc4f]
- Updated dependencies [909a2ed]
- Updated dependencies [613a05a]
- Updated dependencies [acadce2]
- Updated dependencies [2c9d3e3]
- Updated dependencies [04b73de]
- Updated dependencies [898c502]
- Updated dependencies [0d65190]
- Updated dependencies [3778ae7]
- Updated dependencies [64d779e]
- Updated dependencies [ecd6844]
- Updated dependencies [5450451]
- Updated dependencies [d5d6be8]
- Updated dependencies [26b65e9]
- Updated dependencies [21f3bbf]
- Updated dependencies [b42faf3]
- Updated dependencies [3378352]
- Updated dependencies [ad6cb45]
- Updated dependencies [2060f37]
- Updated dependencies [895fc94]
  - octane@0.17.0
  - @octanejs/dnd-kit-accessibility@0.0.2
  - @octanejs/dnd-kit-utilities@0.0.2

## 0.0.1

### Patch Changes

- d6f5536: Add Octane ports of the legacy dnd kit API, one package per upstream package: `@octanejs/dnd-kit-core` (`@dnd-kit/core` 6.3.1), `@octanejs/dnd-kit-sortable` (`@dnd-kit/sortable` 10.0.0), `@octanejs/dnd-kit-modifiers` (`@dnd-kit/modifiers` 9.0.0), `@octanejs/dnd-kit-utilities` (`@dnd-kit/utilities` 3.2.2), and `@octanejs/dnd-kit-accessibility` (`@dnd-kit/accessibility` 3.1.1). They cover `DndContext`, `DragOverlay`, `useDraggable`/`useDroppable`, the sensors and collision algorithms, `SortableContext`/`useSortable` with the sorting strategies and `arrayMove`, the `restrictTo*` and snap modifiers, and the `CSS`/DOM helpers. One difference from React: sensor activator handlers receive the native DOM event, because Octane has no synthetic events.

  The binding catalog maps each `@dnd-kit/*` package to its port, so `@octanejs/codemod` and `octane bindings` resolve them.
- Updated dependencies [d6f5536]
  - @octanejs/dnd-kit-utilities@0.0.1
  - @octanejs/dnd-kit-accessibility@0.0.1
