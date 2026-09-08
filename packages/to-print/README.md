# @octanejs/to-print

Octane binding for [`react-to-print@3.3.0`](https://github.com/MatthewHerbst/react-to-print).

## Installation

```sh
npm install @octanejs/to-print
pnpm add @octanejs/to-print
```

```tsrx
import { useRef } from 'octane';
import { useReactToPrint } from '@octanejs/to-print';

export function Invoice() {
	const contentRef = useRef<HTMLDivElement>(null);
	const handlePrint = useReactToPrint({ contentRef });
	return (
		<div>
			<button type="button" onClick={handlePrint}>Print</button>
			<div ref={contentRef}>printable</div>
		</div>
	);
}
```

See [UPSTREAM.md](./UPSTREAM.md) for the pin and crosswalk.
