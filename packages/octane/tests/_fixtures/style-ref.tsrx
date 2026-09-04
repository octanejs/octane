// `<style ref={x}>` hands the block's class-map object to `x`. The style
// block itself is still stripped from the DOM; the map's values are the
// hashed class strings the scoped rules match.
//
// JSX types still describe a host `<style>` ref (`HTMLStyleElement`). Scoped
// blocks never become that host, so the class-map target is asserted here.

type StyleClassMap = { card: string };

export function AssignedStyleRef() @{
	let classes: StyleClassMap | undefined;
	<>
		<div id="assigned" class="card">
			{classes && classes.card ? classes.card as string : 'missing'}
		</div>
		<style ref={classes as never}>
			.card {
				color: rgb(9, 8, 7);
			}
		</style>
	</>
}

export function CallbackStyleRef() @{
	let classes: StyleClassMap | undefined;
	<>
		<div id="callback" class="card">
			{classes && classes.card ? classes.card as string : 'missing'}
		</div>
		<style
			ref={function (next: StyleClassMap) {
				classes = next;
			} as never}
		>
			.card {
				color: rgb(6, 5, 4);
			}
		</style>
	</>
}

export function IdentifierCallbackStyleRef() @{
	let classes: StyleClassMap | undefined;
	function takeMap(next: StyleClassMap) {
		classes = next;
	}
	<>
		<div id="id-callback" class="card">
			{classes && classes.card ? classes.card as string : 'missing'}
		</div>
		<style ref={takeMap as never}>
			.card {
				color: rgb(14, 15, 16);
			}
		</style>
	</>
}

export function CurrentStyleRef() @{
	const box: { current: StyleClassMap | null } = { current: null };
	<>
		<div id="current" class="card">
			{box.current && box.current.card ? box.current.card as string : 'missing'}
		</div>
		<style ref={box as never}>
			.card {
				color: rgb(3, 2, 1);
			}
		</style>
	</>
}

export function ValueStyleRef() @{
	const box: { value: StyleClassMap | null } = { value: null };
	<>
		<div id="value" class="card">
			{box.value && box.value.card ? box.value.card as string : 'missing'}
		</div>
		<style ref={box as never}>
			.card {
				color: rgb(11, 12, 13);
			}
		</style>
	</>
}

export function ReturnedStyleRef() {
	let classes: StyleClassMap | undefined;
	return <>
		<div id="returned" class="card">
			{classes && classes.card ? classes.card as string : 'missing'}
		</div>
		<style ref={classes as never}>
			.card {
				color: rgb(21, 22, 23);
			}
		</style>
	</>;
}
