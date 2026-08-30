# @octanejs/waypoint

An Octane binding for [`react-waypoint`](https://github.com/brigade/react-waypoint), pinned to version 6.0.0.

## Installation

```sh
npm install @octanejs/waypoint
pnpm add @octanejs/waypoint
```

```tsrx
import { Waypoint } from '@octanejs/waypoint';

export function FeedMarker(props: { loadMore(): void }) @{
	<Waypoint onEnter={props.loadMore} />
}
```

It preserves Waypoint's geometry-based vertical and horizontal position model, pixel and percentage offsets, scrollable-ancestor handling, and rapid-crossing callbacks.

When using a custom marker in `.tsrx`, pass it through `children={<Marker />}`. Nested TSRX children are opaque render blocks, while Waypoint needs an inspectable element in order to clone it and attach its measurement ref.
