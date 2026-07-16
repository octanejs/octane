# @octanejs/react-wrapper

Use Octane components inside a React app. This is the second half of Octane's
bi-directional React bridge:

- `@octanejs/react-compat` — run unmodified React packages **on Octane**.
- `@octanejs/react-wrapper` — mount Octane components **inside React** (this
  package), so a React codebase can adopt Octane incrementally, component by
  component.

The host renderer stays real React (`react` / `react-dom` are peer
dependencies). The wrapper renders a container element into the React tree,
mounts an Octane root into it, and keeps the renderers glued together.

## Usage

```tsx
import { OctaneWrapper, wrapOctane } from '@octanejs/react-wrapper';
import { Counter, Panel } from './octane-components.tsrx';

// One-off:
<OctaneWrapper component={Counter} props={{ start: 5 }} />;

// As a first-class React component:
const ReactCounter = wrapOctane(Counter);
<ReactCounter start={5} />;

// React children render INSIDE the Octane component's `children` hole:
<OctaneWrapper component={Panel} props={{ title: 'Settings' }}>
  <ReactSettingsForm />
</OctaneWrapper>;
```

The `.tsrx` components come from an Octane library, or from your own sources
compiled by `octane/compiler/vite` alongside your React plugin.

## What is guaranteed

- **Props flow on every React commit.** Repeat renders hit the Octane root's
  same-body fast path: props update in place, so Octane state, effects, and DOM
  survive React re-renders. Changing `component` remounts.
- **Synchronous commits.** The Octane render is flushed with Octane's
  `flushSync` from a React layout effect, so Octane DOM is committed before the
  browser paints the React commit. Octane passive effects stay post-paint.
- **React children bridge.** The Octane component receives `children` as a
  layout-neutral host slot (`display: contents`); the wrapper portals the React
  children into it. React state, context, and event handlers keep working
  inside Octane-rendered DOM — events bubble to React's root listener as usual.
- **Bi-directional nesting.** React → Octane → React children → Octane again
  composes; each layer keeps its own renderer.
- **Clean teardown.** Unmounting the wrapper unmounts the Octane root: Octane
  effect cleanups run and the container is emptied. StrictMode's double
  mount/unmount of effects is supported (the root is recreated).

## Boundaries

- Client-only for now: under React SSR the wrapper renders an empty container
  and Octane mounts after hydration.
- React context does not cross the bridge automatically — pass values through
  `props` (or bridge a specific context yourself in the children).
- The bridged `children` slot overrides any `children` key in `props`.

## API

### `OctaneWrapper`

| Prop        | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| `component` | The Octane component to mount.                                   |
| `props`     | Props forwarded to it on every React commit.                     |
| `children`  | React children, bridged into the Octane `children` prop.         |
| `as`        | Container tag rendered by React (default `'div'`).               |
| `className` | Container class.                                                 |
| `style`     | Container style.                                                 |

### `wrapOctane(component, options?)`

Returns a React component with pass-through props and bridged children.
`options` accepts `as`, `className`, `style`, and `displayName`.
