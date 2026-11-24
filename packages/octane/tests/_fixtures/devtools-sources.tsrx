import { useState } from 'octane';

function Badge(props: { label: string }) @{
	<>
		<em>{props.label as string}</em>
		<i>badge</i>
	</>
}

function Stat() @{
	const [n] = useState(1);
	<var>{String(n)}</var>
}

export function SourcesApp(props: { show: boolean }) @{
	const [count, setCount] = useState(0);
	<main class="app" onClick={() => setCount(count + 1)}>
		<h1>Title</h1>
		<Badge label="first" />
		<p>
			<strong>Static</strong>
			{'text' as string}
			<a href="#">link</a>
		</p>
		@if (props.show) {
			<section>
				<b>shown</b>
				<Stat />
			</section>
		}
		<footer>end</footer>
		<svg>
			<template>
				<g />
			</template>
		</svg>
		<template>
			<u>inert</u>
		</template>
	</main>
}
