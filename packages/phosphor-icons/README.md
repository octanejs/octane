# @octanejs/phosphor-icons

[Phosphor Icons](https://phosphoricons.com/) for the
[Octane](https://github.com/octanejs/octane) renderer. Components are generated
from the canonical framework-neutral assets in `@phosphor-icons/core@2.1.1` and
track the icon surface of `@phosphor-icons/react@2.1.10`.

## Install

```bash
npm install @octanejs/phosphor-icons
pnpm add @octanejs/phosphor-icons
```

## Usage

Named and per-icon imports are tree-shakeable. Every icon supports Phosphor's
six weights, size, color, mirroring, accessible title, children, SVG props, and
refs:

```tsrx
import { Camera, Heart } from '@octanejs/phosphor-icons';

export function Toolbar() @{
	<nav>
		<Camera size={24} weight="duotone" alt="Open camera" />
		<Heart color="tomato" weight="fill" mirrored />
	</nav>
}
```

Set shared defaults with the exported context:

```tsrx
import { IconContext, MagnifyingGlass } from '@octanejs/phosphor-icons';

export function SearchIcon() @{
	<IconContext.Provider value={{ color: 'rebeccapurple', size: 20, weight: 'bold' }}>
		<MagnifyingGlass alt="Search" />
	</IconContext.Provider>
}
```

Per-icon imports use the canonical kebab-case name, for example
`@octanejs/phosphor-icons/icons/camera`.

## Octane adaptations

- Icon refs use Octane's normal `ref` prop instead of React `forwardRef`.
- Event handlers observe native DOM events.
- The same component works for client rendering and SSR, so a separate `SSR`
  namespace is not needed.

Generated output is checked against the pinned core metadata and SVG assets.
SSR parity tests compare every weight of a representative icon with the
official React package, and hydration tests verify SVG node adoption.
