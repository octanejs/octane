import { useState } from 'octane';
import { Head, Meta, Seo, Title } from '@octanejs/seo';

/** Layout defaults an inner page overrides, plus interactive state that retitles. */
function Inner() @{
	const [count, setCount] = useState(0);
	<>
		<Seo
			title={'Count ' + count}
			description="page description"
			canonical="/counter"
			site="https://example.com"
		/>
		<main>
			<button id="bump" onClick={() => setCount(count + 1)}>{'bump ' + count as string}</button>
		</main>
	</>
}

export function HydratePage() @{
	<Head>
		<Head>
			<Title text="Layout default" />
			<Meta name="theme-color" content="#000000" />
		</Head>
		<Inner />
	</Head>
}
