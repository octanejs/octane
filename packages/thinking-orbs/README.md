# @octanejs/thinking-orbs

Octane binding for [`thinking-orbs`](https://github.com/Jakubantalik/thinking-orbs), with all nine canvas animations, both tuned sizes, live theme detection, reduced-motion handling, and the framework-neutral engine API.

```tsrx
import { ThinkingOrb } from '@octanejs/thinking-orbs';

export function Status() @{
	<ThinkingOrb state="searching" size={20} theme="auto" />
}
```

Power users can import `MODE_FRAMES`, `MODE_DRAWS`, `resolvePreset`, and the engine types from `@octanejs/thinking-orbs/engine`.

The package requires Octane and ships authored TypeScript/TSRX source for the consuming application to compile.
