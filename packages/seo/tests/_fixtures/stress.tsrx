import { useState } from 'octane';
import { Head, Meta, Seo, Title } from '@octanejs/seo';

/** Five levels of nesting, each contributing and the deepest winning. */
function L5() @{
	<Head>
		<Title text="depth-5" />
	</Head>
}
function L4() @{
	<Head>
		<Title text="depth-4" />
		<L5 />
	</Head>
}
function L3() @{
	<Head>
		<Title text="depth-3" />
		<L4 />
	</Head>
}
function L2() @{
	<Head>
		<Title text="depth-2" />
		<L3 />
	</Head>
}
export function DeeplyNested() @{
	<Head>
		<Title text="depth-1" />
		<L2 />
	</Head>
}

/** Rapid, repeated churn of the same identity. */
export function Churn() @{
	const [n, setN] = useState(0);
	<Head>
		<Seo title={'n=' + n} description={'d=' + n} canonical={'/n/' + n} />
		<button id="bump" onClick={() => setN(n + 1)}>{'bump ' + n as string}</button>
	</Head>
}

/** A block that appears and disappears while a sibling keeps registering. */
export function Toggling() @{
	const [on, setOn] = useState(false);
	<Head>
		<Title text="base" />
		<Meta name="description" content="base description" />
		@if (on) {
			<Head>
				<Title text="overlay" />
				<Meta name="robots" content="noindex, follow" />
			</Head>
		}
		<button id="toggle" onClick={() => setOn(!on)}>toggle</button>
	</Head>
}

/** Two siblings racing for the same identity in one render. */
export function SameKeyTwice() @{
	<Head>
		<Title text="first" />
		<Title text="second" />
		<Meta name="description" content="a" />
		<Meta name="description" content="b" />
	</Head>
}
