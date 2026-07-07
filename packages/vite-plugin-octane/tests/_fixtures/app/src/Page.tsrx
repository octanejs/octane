import { useState } from 'octane';

// A page with a dynamic text hole, a param read, and an event handler — enough
// to prove the server bundle renders hydratable markup (markers + scoped
// state) identical to dev SSR.
export function Page(props: { params: Record<string, string>; url: string }) @{
	const [count] = useState(1);
	<main>
		<h1>
			{'Fixture page ' + (props.params.slug ?? 'home')}
		</h1>
		<p class="url">{props.url}</p>
		<p class="count">
			{'Count: ' + count}
		</p>
	</main>
}
