# @octanejs/image-crop

The Octane port of `react-image-crop@11.1.2`.

## Installation

```sh
npm install @octanejs/image-crop
pnpm add @octanejs/image-crop
```

```tsrx
import { useState } from 'octane';
import ReactCrop, { type Crop } from '@octanejs/image-crop';
import '@octanejs/image-crop/ReactCrop.css';

export function AvatarCrop() @{
	const [crop, setCrop] = useState<Crop>({
		unit: '%',
		x: 10,
		y: 10,
		width: 80,
		height: 80,
	});

	<ReactCrop crop={crop} onChange={(_pixels, percentage) => setCrop(percentage)}>
		<img src="/avatar.jpg" alt="Choose an avatar crop" />
	</ReactCrop>
}
```

The component preserves the pinned release's controlled crop API, resize and drag constraints, keyboard nudging, aspect handling, circular crop mask, rule-of-thirds overlay, selection addon, utilities, and legacy `Component` alias.

Octane handlers use native `PointerEvent` and `KeyboardEvent` objects. The public crop update callback remains named `onChange`.

See [UPSTREAM.md](./UPSTREAM.md) for the immutable source pin, npm integrity, export crosswalk, and upstream test inventory.

## License

ISC. The upstream copyright and permission notice are retained in [LICENSE](./LICENSE).
