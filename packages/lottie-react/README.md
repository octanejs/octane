# @octanejs/lottie-react

Render Lottie animations in Octane. The binding provides the `Lottie` component, the `useLottie` and `useLottieInteractivity` hooks, and the `LottiePlayer` export from `lottie-web`.

```sh
npm install @octanejs/lottie-react
```

```sh
pnpm add @octanejs/lottie-react
```

```tsrx
import Lottie from '@octanejs/lottie-react';
import animationData from './animation.json';

export function LoadingAnimation() {
  return (
    <Lottie
      animationData={animationData}
      aria-label="Loading"
      autoplay
      loop
      style={{ width: '8rem' }}
    />
  );
}
```

Pass an object ref as `lottieRef` to control playback through methods such as `play`, `pause`, and `goToAndStop`. Use `useLottie` when you need the rendered `View` and the playback methods in the same component. Pass the hook result as `lottieObj` to `useLottieInteractivity` to attach scroll or cursor actions.

When migrating from `lottie-react`, update the import after confirming that Octane renders the component and owns the returned `View`.

Animation callbacks such as `onComplete` and `onEnterFrame` receive Lottie player events. Container props and event handlers use Octane's native DOM types. Server rendering emits the container and initializes playback on the client.

This binding ports `lottie-react@2.4.1` by David Gamote and contributors. Its [upstream license](./LICENSE.upstream) and [source and test evidence](./UPSTREAM.md) accompany the package.
