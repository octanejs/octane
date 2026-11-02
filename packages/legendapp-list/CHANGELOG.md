# @octanejs/legendapp-list

## 0.0.1

### Patch Changes

- a222919: Add `@octanejs/legendapp-list`, an Octane port of `@legendapp/list/react` from `@legendapp/list` 3.3.5. `LegendList` keeps every upstream prop, including recycled rows, dynamic item sizes, columns, sticky headers, snapping, initial scroll, `maintainScrollAtEnd`, `maintainVisibleContentPosition`, `anchoredEndSpace` and viewability callbacks. It also keeps the imperative handle (`scrollToIndex`, `scrollToOffset`, `scrollToEnd`, `scrollIndexIntoView`, `getState`, …), the nine per-row hooks and every exported type. Pass `ref` as a prop. Server rendering emits the same markup as upstream.
