import { Hydrate, Suspense, use } from 'octane';

function StreamedCollisionButton(props) @{
	const value = use(props.promise);
	<button
		id="stream-collision-action"
		onClick={() => props.onClick?.(value)}
	>{value as string}</button>
}

export function AuthoredStreamAttribute(props) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<template data-oct-b="authored-template"></template>
		<button id="authored-stream-attribute-action" onClick={props.onClick}>{'Activate'}</button>
	</Hydrate>
}

export function ForgedNestedHydrateAttribute(props) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<section data-octane-hydrate-id="authored-lookalike">
			<Suspense fallback={<button id="stream-collision-action">{'Loading forged owner'}</button>}>
				<StreamedCollisionButton promise={props.promise} onClick={props.onClick} />
			</Suspense>
		</section>
	</Hydrate>
}

export function MalformedStaticComment(props) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<div dangerouslySetInnerHTML={{ __html: props.authoredHtml }} />
		<Suspense fallback={<button id="stream-collision-action">{'Loading malformed marker'}</button>}>
			<StreamedCollisionButton promise={props.promise} onClick={props.onClick} />
		</Suspense>
	</Hydrate>
}
