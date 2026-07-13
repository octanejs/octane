# @octanejs/lucide

[Lucide](https://lucide.dev/) icons for the
[Octane](https://github.com/octanejs/octane) renderer. The package tracks the
published `lucide-react@1.24.0` API and uses official framework-neutral icon
data from `@lucide/icons`.

## Install

```bash
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
		<CircleAlert color="tomato" absoluteStrokeWidth />
	</nav>
}
```

Provider defaults, custom nodes, aliases, and dynamic loading are included:

```tsrx
import { LucideProvider, icons } from '@octanejs/lucide';
import { DynamicIcon } from '@octanejs/lucide/dynamic';

export function App() @{
	<LucideProvider color="rebeccapurple" strokeWidth={1.5}>
		<icons.Search />
		<DynamicIcon name="camera" fallback={<span>Loading…</span>} />
	</LucideProvider>
}
```

Per-icon imports are available as `@octanejs/lucide/icons/camera`. `Icon` and
`createLucideIcon` support custom icon data in the same shape as Lucide React.

## Octane adaptations

- Icon refs use Octane's normal `ref` prop instead of React `forwardRef`.
- Event handlers observe native DOM events.

The generated export, alias, and dynamic-name surfaces are checked against
`lucide-react@1.24.0`. Differential tests render shared `.tsrx` fixtures through
both libraries and compare the SVG DOM.

See the [port plan](../../docs/lucide-port-plan.md) and generated
[bindings status](../../docs/bindings-status.md) for scope and evidence.
