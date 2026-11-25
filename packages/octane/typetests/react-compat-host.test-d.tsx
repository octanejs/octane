import * as React from 'react';
import { Frame } from '../tests/browser/react-compat-host/Frame.tsrx';

const ref = React.createRef<HTMLDivElement>();
<Frame ref={ref} className="open" style={{ width: 100 }} aria-label="Frame" data-open>
	<React.Suspense>
		<textarea />
	</React.Suspense>
</Frame>;
<Frame onClick={(event) => event.currentTarget.focus()} />;
// @ts-expect-error The declared binding accepts booleans.
<Frame data-open="yes" />;
// @ts-expect-error Normal div props retain their types.
<Frame className={false} />;
// @ts-expect-error Refs receive a div.
<Frame ref={React.createRef<SVGElement>()} />;
// @ts-expect-error Children must be React nodes.
<Frame>{{ arbitrary: true }}</Frame>;
// @ts-expect-error Data attributes take scalar DOM values.
const invalid: React.ComponentProps<typeof Frame> = { 'data-other': { value: 1 } };
