# @octanejs/sanity-logos

Octane port of `@sanity/logos@2.2.5`, including `SanityLogo`, `SanityMonogram`,
`GroqLogo`, and `GroqMonogram`.

```sh
npm install @octanejs/sanity-logos
pnpm add @octanejs/sanity-logos
```

```tsrx
import {SanityLogo} from '@octanejs/sanity-logos'

export function Brand() @{
  <SanityLogo dark aria-label="Sanity" />
}
```

Logo props, Sanity color schemes, custom monogram colors, arbitrary SVG attributes, and
normal Octane refs are supported.
