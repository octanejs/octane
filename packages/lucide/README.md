# @octanejs/lucide

[Lucide](https://lucide.dev/) icons for the
[Octane](https://github.com/octanejs/octane) renderer. The package tracks the
published `lucide-react@1.45.0` API and uses official framework-neutral icon
data from `@lucide/icons`.

## Install

```bash
npm install @octanejs/lucide
pnpm add @octanejs/lucide
```

## Usage

Named icons are tree-shakeable and accept the same presentation props as
Lucide React:

```tsrx
import { Camera, CircleAlert } from '@octanejs/lucide';

export function Toolbar() @{
	<nav>
		<Camera size={20} strokeWidth={1.5} aria-label="Camera" />
		<CircleAlert color="tomato" nonScalingStroke />
	</nav>
}
```

Provider defaults, custom nodes, aliases, and dynamic loading are included:

```tsrx
import { LucideProvider, icons } from '@octanejs/lucide';
import { DynamicIcon } from '@octanejs/lucide/dynamic';

function Loading() @{
	<span>Loading…</span>
}

export function App() @{
	<LucideProvider color="rebeccapurple" strokeWidth={1.5}>
		<icons.Search />
		<DynamicIcon name="camera" fallback={Loading} />
	</LucideProvider>
}
```

The existing `CircleEuroSign` / `circle-euro-sign` imports remain available as
aliases for `CircleEuro`. Dynamic modules retain the older `__iconNode` export
alongside `__iconData`.

Per-icon imports are available as `@octanejs/lucide/icons/camera`. `Icon` and
`createLucideIcon` support custom icon data in the same shape as Lucide React.
Pass `{ name, node, aliases, size }` or `{ name, node, aliases, width, height }`
to the factory, then render the resulting component. The legacy
`createLucideIcon(name, node, aliases?)` form remains available.

`nonScalingStroke` works on icons and `LucideProvider`. Explicit icon props take
precedence over provider defaults. `absoluteStrokeWidth` remains supported but
is deprecated upstream. Custom icon classes use the supplied name and aliases;
they no longer add an extra kebab-case class for a legacy underscore name.

## Octane adaptations

- Icon refs use Octane's normal `ref` prop instead of React `forwardRef`.
- Event handlers observe native DOM events.

The generated export, alias, and dynamic-name surfaces are checked against
`lucide-react@1.45.0`. Differential tests render shared `.tsrx` fixtures through
both libraries and compare the SVG DOM.

See the [port plan](../../docs/lucide-port-plan.md) and generated
[bindings status](../../docs/bindings-status.md) for scope and evidence.
