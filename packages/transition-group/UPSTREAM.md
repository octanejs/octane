# Upstream provenance

This binding is pinned to [`react-transition-group` v4.4.5](https://github.com/reactjs/react-transition-group/tree/v4.4.5), commit `4cb51a9be0ebf508cb8f6506452097f7ebb874fe`.

The upstream project and this adapted package are licensed under BSD-3-Clause. The upstream notice is retained in `LICENSE` and `upstream/LICENSE`.

## Vendored evidence

## Test-suite disposition

| Upstream artifact | Disposition |
| --- | --- |
| `test/Transition-test.js` | Adapted in `tests/upstream/Transition.test.ts` (both findDOMNode cases are not applicable) |
| `test/CSSTransition-test.js` | Adapted in `tests/upstream/CSSTransition.test.ts` |
| `test/CSSTransitionGroup-test.js` | Adapted in `tests/upstream/TransitionGroup.test.ts` |
| `test/TransitionGroup-test.js` | Adapted in `tests/upstream/TransitionGroup.test.ts` (StrictMode double-appear is an Octane divergence) |
| `test/SwitchTransition-test.js` | Adapted in `tests/upstream/SwitchTransition.test.ts` |
| `test/ChildMapping-test.js` | Adapted in `tests/upstream/ChildMapping.test.ts` |
| `test/SSR-test.js` | Adapted in `tests/ssr/upstream-import.test.ts` |

## Public surface

The published React package exposes six root modules and the Octane package preserves each mapping:

| React import | Octane import |
| --- | --- |
| `react-transition-group` | `@octanejs/transition-group` |
| `react-transition-group/Transition` | `@octanejs/transition-group/Transition` |
| `react-transition-group/CSSTransition` | `@octanejs/transition-group/CSSTransition` |
| `react-transition-group/TransitionGroup` | `@octanejs/transition-group/TransitionGroup` |
| `react-transition-group/SwitchTransition` | `@octanejs/transition-group/SwitchTransition` |
| `react-transition-group/ReplaceTransition` | `@octanejs/transition-group/ReplaceTransition` |
| `react-transition-group/config` | `@octanejs/transition-group/config` |

## Adaptation notes

Octane has no `ReactDOM.findDOMNode` equivalent. DOM-aware callbacks and `CSSTransition` therefore require `nodeRef`; callers that omit it still receive lifecycle timing and state transitions, but no inferred DOM node. This follows React Transition Group's recommended `nodeRef` path and avoids a legacy API that React Strict Mode deprecates.

Compiler-generated Octane children blocks are distinguished from genuine render props with `isChildrenBlock`. Introspective collection components should pass descriptor collections through the `children` prop (for example, `children={items.map(...)}`), so keys remain inspectable by `TransitionGroup`.
