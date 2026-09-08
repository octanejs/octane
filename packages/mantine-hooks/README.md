# @octanejs/mantine-hooks

Mantine hooks for Octane. This package ports the complete
`@mantine/hooks@9.5.0` runtime surface to Octane hooks while preserving Mantine's
public names, arguments, return values, and browser behavior.

## Installation

```sh
npm install @octanejs/mantine-hooks
pnpm add @octanejs/mantine-hooks
```

```tsrx
import { useCounter, useDisclosure } from '@octanejs/mantine-hooks';

export function Controls() @{
	const [count, counter] = useCounter(0, { min: 0, max: 10 });
	const [opened, disclosure] = useDisclosure(false);

	<section>
		<button onClick={counter.increment}>{count as string}</button>
		<button onClick={disclosure.toggle}>{opened ? 'close' : 'open'}</button>
	</section>
}
```

## Compatibility

- All runtime exports from `@mantine/hooks@9.5.0` are present.
- Hook implementations use Octane state, effects, refs, memoization, and
  compiler-injected hook slots.
- DOM subscriptions use native browser events, matching Mantine's underlying
  behavior.
- React is not a runtime dependency. React type declarations are retained for
  source-compatible ref, event, and style types.
