# Octane in Storybook

A client-rendered Storybook workbench for native Octane components authored in
`.tsrx`. Storybook uses its React renderer; an ordinary React `.stories.tsx`
wrapper hosts each Octane component through `OctaneCompat`.

## Run

Use Node.js 22.22.2 or newer and pnpm 12.9.1. From the repository root:

```bash
pnpm install
pnpm --filter storybook-example dev
```

Open the local URL printed by Storybook and select **Octane → Counter**. Increment
the counter, then change `label`, `step`, or `disabled` in Controls. Prop changes
preserve the current count. Switching to **Large Step** and back starts a fresh
counter.

The other commands also run from the repository root:

```bash
pnpm --filter storybook-example typecheck
pnpm --filter storybook-example build
pnpm --filter storybook-example test:e2e
```

`build` writes the static Storybook to `examples/storybook/dist`. `test:e2e`
builds once, then runs the Controls, native events, scoped styles, and story
lifecycle journeys against both development Storybook and the served static
build. Playwright starts and stops both servers. If Chromium is not installed:

```bash
pnpm --filter storybook-example exec playwright install chromium
```

## Compiler ownership

The example uses Storybook and `@storybook/react-vite` 10.6.1, Vite 8.1.5,
`@vitejs/plugin-react` 6.0.3, matching React and React DOM 19.2.7, and workspace
Octane 0.13.8. Dependency versions come from the root workspace catalog and
lockfile.

[`.storybook/main.ts`](.storybook/main.ts) merges the two compiler plugins into
Storybook's Vite configuration:

```ts
import type { StorybookConfig } from '@storybook/react-vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
	stories: ['../src/**/*.stories.tsx'],
	framework: '@storybook/react-vite',
	typescript: { reactDocgen: false },
	async viteFinal(config) {
		return mergeConfig(config, {
			plugins: [octane({ requireDirective: true }), react()],
			optimizeDeps: { exclude: ['octane'], include: ['octane > devalue'] },
		});
	},
};

export default config;
```

Keep Octane before the single React plugin. `.tsrx` belongs to Octane; the story
file carries `/** @jsxImportSource react */` so React owns its JSX. The
`requireDirective` option keeps unmarked application TSX React-owned. This
component workbench uses `octane/compiler/vite` directly rather than the full
application plugin, `@octanejs/vite-plugin`.

The linked workspace Octane package contains raw source, so it is excluded from
Vite's dependency optimizer. Its `devalue` dependency is included eagerly so the
first preview can load without a late dependency optimization reload.

## Typed stories and Controls

[`Counter.stories.tsx`](src/Counter.stories.tsx) defines a stable named React
wrapper around the native [`Counter.tsrx`](src/Counter.tsrx) component:

```tsx
/** @jsxImportSource react */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { OctaneCompat } from 'octane/react';
import { Counter, type CounterProps } from './Counter.tsrx';

function CounterStory(props: CounterProps) {
	return <OctaneCompat component={Counter} props={props} />;
}

const meta = {
	title: 'Octane/Counter',
	component: CounterStory,
	args: { label: 'Increment', step: 1, disabled: false },
	argTypes: {
		label: { control: 'text' },
		step: { control: 'number' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta<typeof CounterStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
```

Set Storybook's `component` to the React wrapper. Passing the raw Octane function
would let React invoke a component that belongs to Octane's renderer. The
`component`/`props` bridge form preserves the native prop types, and the
`typecheck` script uses `octane-tsc` without ambient `.tsrx` shims or casts.
Explicit `args` and `argTypes` supply Controls; React docgen is disabled, and
automatic native-component prop documentation is outside this recipe.

The example is client-only. `OctaneCompat` adds a `div` host, so place it where
ordinary HTML permits a div, rather than directly in a table row, select, or SVG
tree. The example supports ordinary `.stories.tsx` files; `.stories.tsrx`, a
TSRX Storybook addon, and custom renderers or indexers are outside its scope.
Development component and style edits update the preview; reload if needed.
Preserving local state through Fast Refresh is not guaranteed.

See the [React compatibility guide](../../docs/react-compat.md) for renderer and
compiler ownership, and the [examples catalog](../README.md) for the wider
application fixtures.
