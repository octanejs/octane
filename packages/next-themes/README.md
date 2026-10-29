# @octanejs/next-themes

[next-themes](https://github.com/pacocoursey/next-themes) for
[Octane](https://github.com/octanejs/octane). It ports the published
`next-themes@0.4.6` surface: `ThemeProvider`, the `useTheme` hook, and the inline
script that applies the saved theme before the page paints. It works in any Octane
app, with or without a framework.

## Installation

```bash
npm install @octanejs/next-themes
pnpm add @octanejs/next-themes
```

## Usage

Wrap the app once, near the root:

```tsx
import { ThemeProvider } from '@octanejs/next-themes';

export function App() @{
	<ThemeProvider attribute="class" defaultTheme="system">
		<Page />
	</ThemeProvider>
}
```

Read and change the theme anywhere below it:

```tsx
import { useEffect, useState } from 'octane';
import { useTheme } from '@octanejs/next-themes';

export function ThemeSwitch() @{
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);
	<button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
		{mounted ? `Switch from ${resolvedTheme}` : 'Switch theme'}
	</button>
}
```

As with next-themes, the server cannot know the saved theme, so `theme` and
`resolvedTheme` are `undefined` during server rendering. Render theme-dependent
UI after mount, as above, or style it with CSS keyed on the theme attribute.

## API

`ThemeProvider` takes every next-themes prop:

| Prop | Default | Meaning |
| --- | --- | --- |
| `attribute` | `'data-theme'` | `'class'`, a `data-*` attribute, or an array of them, set on `<html>` |
| `defaultTheme` | `'system'` (`'light'` when `enableSystem` is false) | Theme used when nothing is saved |
| `enableSystem` | `true` | Follow `prefers-color-scheme` while the theme is `'system'` |
| `enableColorScheme` | `true` | Set `color-scheme` on `<html>` for light and dark |
| `storageKey` | `'theme'` | localStorage key |
| `forcedTheme` | | Theme applied to the page regardless of the saved one |
| `disableTransitionOnChange` | `false` | Suspend CSS transitions while switching |
| `themes` | `['light', 'dark']` | Theme names |
| `value` | | Map from theme name to the attribute value written |
| `nonce` | | CSP nonce for the inline script and the transition-blocking style |
| `scriptProps` | | Extra props for the inline `<script>` |

`useTheme()` returns `theme`, `setTheme` (a value or an updater), `resolvedTheme`,
`systemTheme`, `forcedTheme`, and `themes`. A nested `ThemeProvider` renders its
children and defers to the outer one.

The types `Attribute`, `ThemeProviderProps`, and `UseThemeProps` are exported.

## Server rendering

`ThemeProvider` renders an inline `<script>` that runs before first paint, reads
localStorage and the system preference, and sets the theme attribute and
`color-scheme` on `<html>`, so the page never flashes the wrong theme. It renders
through `octane/server`, carries `nonce` and `scriptProps`, and hydration adopts
the server's script as it is.

## Differences from next-themes

There is no behavioral difference. The binding uses Octane's `<Context value>`
in place of `Context.Provider`, and its prop types are Octane's
`DetailedHTMLProps`, `ScriptHTMLAttributes`, and `PropsWithChildren`.

See [UPSTREAM.md](./UPSTREAM.md) for the pinned source and how parity is tested.
