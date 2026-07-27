import { useState } from 'octane';
import { Head, Title } from '@octanejs/seo';

/** A conditionally rendered child that retitles the page. */
function TabPanel() @{
	<Head>
		<Title text="ZZZ" />
		<section>tab</section>
	</Head>
}

/**
 * The arrangement that has to work: A's `<Head>` wraps only its own tags, and
 * `<TabPanel />` renders after it as a SIBLING, not inside it. This is how the
 * code reads naturally, so it must produce the inner component's title.
 */
export function SiblingHeads() @{
	const [open, setOpen] = useState(false);
	<Head>
		<Head>
			<Title text="XYZ" />
		</Head>
		<button id="toggle" onClick={() => setOpen(!open)}>toggle</button>
		@if (open) {
			<TabPanel />
		}
	</Head>
}

/** The same intent with B's `<Head>` nested inside A's. */
export function NestedHeads() @{
	const [open, setOpen] = useState(false);
	<Head>
		<Head>
			<Title text="XYZ" />
			<button id="toggle" onClick={() => setOpen(!open)}>toggle</button>
			@if (open) {
				<TabPanel />
			}
		</Head>
	</Head>
}

/** Two sibling blocks in unrelated components, far apart in the tree. */
function LeftPane() @{
	<Head>
		<Title text="left" />
	</Head>
}

function RightPane() @{
	<Head>
		<Title text="right" />
	</Head>
}

export function DistantSiblings() @{
	<Head>
		<aside>
			<LeftPane />
		</aside>
		<main>
			<RightPane />
		</main>
	</Head>
}
