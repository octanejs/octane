# Binding parity gaps (generated)

<!-- GENERATED FILE — do not edit. Regenerate with `pnpm binding-parity:gaps`. -->

This is the executable failure-pin audit for every framework binding discovered
from the workspace inventory. It includes `it.fails(...)` and
`test.fails(...)` across JavaScript, TypeScript, TSX, and TSRX test files.

Committed tests must run normally, so repository policy requires every row to
remain at zero. Zero pins does **not** imply complete upstream parity. Consult
[`docs/bindings-status.md`](bindings-status.md) for each binding's supported
surface and evidence.

**29 active pin(s) across 106 binding package(s).**

| Package | Active pins |
| --- | ---: |
| `@octanejs/alien-signals` | 0 |
| `@octanejs/animejs` | 0 |
| `@octanejs/apollo-client` | 0 |
| `@octanejs/aria` | 0 |
| `@octanejs/auto-animate` | 0 |
| `@octanejs/base-ui` | 0 |
| `@octanejs/better-auth` | 0 |
| `@octanejs/calendar` | 0 |
| `@octanejs/cmdk` | 0 |
| `@octanejs/colorful` | 0 |
| `@octanejs/content-loader` | 0 |
| `@octanejs/day-picker` | 0 |
| `@octanejs/devtools` | 0 |
| `@octanejs/dexie` | 0 |
| `@octanejs/dnd-kit` | 0 |
| `@octanejs/draggable` | 0 |
| `@octanejs/drei` | 0 |
| `@octanejs/dropzone` | 0 |
| `@octanejs/electron` | 0 |
| `@octanejs/email` | 0 |
| `@octanejs/email-cli` | 0 |
| `@octanejs/embla-carousel` | 0 |
| `@octanejs/floating-ui` | 29 |
| `@octanejs/formisch` | 0 |
| `@octanejs/gsap` | 0 |
| `@octanejs/hook-form` | 0 |
| `@octanejs/html-react-parser` | 0 |
| `@octanejs/i18next` | 0 |
| `@octanejs/image-crop` | 0 |
| `@octanejs/inertia` | 0 |
| `@octanejs/ink` | 0 |
| `@octanejs/input-otp` | 0 |
| `@octanejs/intersection-observer` | 0 |
| `@octanejs/jotai` | 0 |
| `@octanejs/lexical` | 0 |
| `@octanejs/livestore` | 0 |
| `@octanejs/lucide` | 0 |
| `@octanejs/mantine-hooks` | 0 |
| `@octanejs/markdown` | 0 |
| `@octanejs/mdx` | 0 |
| `@octanejs/mobx` | 0 |
| `@octanejs/monaco-editor` | 0 |
| `@octanejs/motion` | 0 |
| `@octanejs/nuqs` | 0 |
| `@octanejs/opentui` | 0 |
| `@octanejs/pdf` | 0 |
| `@octanejs/phosphor-icons` | 0 |
| `@octanejs/popper` | 0 |
| `@octanejs/portabletext` | 0 |
| `@octanejs/radix` | 0 |
| `@octanejs/rainbowkit` | 0 |
| `@octanejs/react-error-boundary` | 0 |
| `@octanejs/react-map-gl` | 0 |
| `@octanejs/recharts` | 0 |
| `@octanejs/redux` | 0 |
| `@octanejs/redux-toolkit` | 0 |
| `@octanejs/remix-router` | 0 |
| `@octanejs/resizable-panels` | 0 |
| `@octanejs/rxjs` | 0 |
| `@octanejs/sanity-icons` | 0 |
| `@octanejs/sanity-loader` | 0 |
| `@octanejs/sanity-logos` | 0 |
| `@octanejs/select` | 0 |
| `@octanejs/shadcn` | 0 |
| `@octanejs/solana-kit` | 0 |
| `@octanejs/sonner` | 0 |
| `@octanejs/spring` | 0 |
| `@octanejs/stick-to-bottom` | 0 |
| `@octanejs/streamdown` | 0 |
| `@octanejs/styled-components` | 0 |
| `@octanejs/stylex` | 0 |
| `@octanejs/swr` | 0 |
| `@octanejs/syntax-highlighter` | 0 |
| `@octanejs/tanstack-ai` | 0 |
| `@octanejs/tanstack-db` | 0 |
| `@octanejs/tanstack-devtools` | 0 |
| `@octanejs/tanstack-form` | 0 |
| `@octanejs/tanstack-hotkeys` | 0 |
| `@octanejs/tanstack-pacer` | 0 |
| `@octanejs/tanstack-query` | 0 |
| `@octanejs/tanstack-router` | 0 |
| `@octanejs/tanstack-router-ssr-query` | 0 |
| `@octanejs/tanstack-store` | 0 |
| `@octanejs/tanstack-table` | 0 |
| `@octanejs/tanstack-virtual` | 0 |
| `@octanejs/tauri` | 0 |
| `@octanejs/testing-library` | 0 |
| `@octanejs/textarea-autosize` | 0 |
| `@octanejs/thinking-orbs` | 0 |
| `@octanejs/three` | 0 |
| `@octanejs/tiptap` | 0 |
| `@octanejs/to-print` | 0 |
| `@octanejs/transition-group` | 0 |
| `@octanejs/usehooks-ts` | 0 |
| `@octanejs/valtio` | 0 |
| `@octanejs/vaul` | 0 |
| `@octanejs/visx` | 0 |
| `@octanejs/wagmi` | 0 |
| `@octanejs/waypoint` | 0 |
| `@octanejs/window` | 0 |
| `@octanejs/wouter` | 0 |
| `@octanejs/xstate` | 0 |
| `@octanejs/xstate-store` | 0 |
| `@octanejs/xyflow` | 0 |
| `@octanejs/zag` | 0 |
| `@octanejs/zustand` | 0 |

## @octanejs/floating-ui

### packages/floating-ui/tests/upstream/react-dom/index.test.tsx

- **middleware is always fresh and does not cause an infinite loop**
- **calls the cleanup function**
- **unstable callback refs**

### packages/floating-ui/tests/upstream/react/unit/FloatingFocusManager.test.tsx

- **return to the first focusable descendent of the reference, if the reference is not focusable**
- **tabs from the popover to the next element in the iframe**
- **shift+tab from the popover to the previous element in the iframe**
- **does not focus reference when hovering it**
- **returns focus to reference when floating element was opened by hover but is closed by esc key**
- **returns focus to reference when floating element was opened by hover but is closed by an explicit close button**
- **does not re-open after closing via escape key**
- **closes when unhovering floating element even when focus is inside it**
- **does not close when clicking another button outside**
- **closeOnFocusOut=false - does not close when tabbing out**
- **returns focus when tabbing out then back to close button**
- **aria-hidden is not applied on root combobox with virtual nested menu**

### packages/floating-ui/tests/upstream/react/unit/NextFloatingDelayGroup.test.tsx

- **does not re-render unrelated consumers**

### packages/floating-ui/tests/upstream/react/unit/useClientPoint.test.tsx

- **cleans up window listener when closing or disabling**

### packages/floating-ui/tests/upstream/react/unit/useFloating.test.tsx

- **handles unstable reference prop**
- **handles real virtual element**

### packages/floating-ui/tests/upstream/react/unit/useListNavigation.test.tsx

- **resets indexRef to -1 upon close**
- **grid navigation with changing list items**
- **grid navigation with disabled list items**
- **focus management in nested lists**
- **keyboard navigation in nested menus lists**
- **keyboard navigation in nested menus with different orientation**
- **virtual nested Home or End key press**
- **domReference trigger in nested virtual menu is set as virtual item**

### packages/floating-ui/tests/upstream/react/unit/useTypeahead.test.tsx

- **Menu - skips disabled items and opens submenu on space if no match**
- **Menu - resets once a match is no longer found**
