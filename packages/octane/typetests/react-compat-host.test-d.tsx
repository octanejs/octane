import * as React from 'react';
import { Button, Frame, Navigation, Stroke } from '../tests/browser/react-compat-host/Frame.tsrx';

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

<Button
	type="submit"
	ref={React.createRef<HTMLButtonElement>()}
	onClick={(event) => event.currentTarget.form?.reset()}
/>;
<Stroke d="M0 0" ref={React.createRef<SVGPathElement>()} />;
<Navigation input={{ state: 'open', style: {} }} />;
// @ts-expect-error Private projection inputs are required as declared.
<Navigation />;
// @ts-expect-error Button props cannot include an anchor destination.
<Button href="/inbox" />;
// @ts-expect-error Refs follow the declared element.
<Button ref={ref} />;
// @ts-expect-error The button template does not declare a private input.
<Button input={{ active: true }} />;
