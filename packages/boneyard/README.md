# @octanejs/boneyard

Clean-room Octane binding for Boneyard skeleton screens.

```tsrx
import { Skeleton } from '@octanejs/boneyard';
import bones from './profile.bones.json';

export function Profile(props: { loading: boolean }) @{
  <Skeleton name="profile" loading={props.loading} initialBones={bones}>
    <article>Profile content</article>
  </Skeleton>
}
```

The package accepts Boneyard's compact `.bones.json` format, selects responsive
breakpoints from the wrapper width, supports the generated-registry pattern,
and renders usable SSR output when `initialBones` or a registry entry is known.

This binding does not include Boneyard's Playwright capture CLI or adapters for
other UI frameworks. Existing `.bones.json` files remain consumable.
