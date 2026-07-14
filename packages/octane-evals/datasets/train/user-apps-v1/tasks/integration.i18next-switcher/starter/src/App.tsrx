import type { i18n } from 'i18next';

export function App(props: { i18n: i18n; name: string }) @{
	<section>
		<h1>{props.name}</h1>
		<p>Read the profile</p>
		<button aria-pressed="true">English</button>
		<button aria-pressed="false">French</button>
	</section>
}
