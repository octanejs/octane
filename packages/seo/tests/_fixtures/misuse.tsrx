import { Head, Title } from '@octanejs/seo';

/** A tag with no <Head> at all: must fail loudly, not silently do nothing. */
export function NoHead() @{
	<>
		<Title text="Orphan" />
		<main>orphan</main>
	</>
}

/**
 * Two outermost <Head> elements, neither containing the other. Each owns and
 * emits, so the document gets duplicate tags and the first wins. Reported.
 */
export function StrayOwners() @{
	<>
		<Head>
			<Title text="Outer" />
		</Head>
		<Head>
			<Title text="Inner" />
		</Head>
		<main>stray</main>
	</>
}
