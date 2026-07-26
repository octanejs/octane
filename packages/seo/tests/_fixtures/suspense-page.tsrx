import { use } from 'octane';
import { Head, Meta, Title } from '@octanejs/seo';

/**
 * Metadata around a boundary that suspends, so `prerender` runs several passes
 * over the same tree. Every pass re-registers the same components; the output
 * must be identical to a single-pass render.
 */
function Deferred(props: { value: Promise<string> }) @{
	<>
		<Meta name="deferred" content={use(props.value) as string} />
		<article>{use(props.value) as string}</article>
	</>
}

export function SuspensePage(props: { value: Promise<string> }) @{
	<Head>
		<Head>
			<Title text="Suspense page" />
			<Meta name="description" content="static description" />
		</Head>
		@try {
			<Deferred value={props.value} />
		} @pending {
			<p>loading</p>
		}
		<main>body</main>
	</Head>
}
