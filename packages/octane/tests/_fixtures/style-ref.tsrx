// `<style ref={x}>` hands the block's class-map object to `x`. The style
// block itself is still stripped from the DOM; the map's values are the
// hashed class strings the scoped rules match.

export function AssignedStyleRef() @{
	let classes;
	<>
		<div id="assigned" class="card">
			{classes && classes.card ? classes.card as string : 'missing'}
		</div>
		<style ref={classes}>
			.card {
				color: rgb(9, 8, 7);
			}
		</style>
	</>
}

export function CallbackStyleRef() @{
	let classes;
	<>
		<div id="callback" class="card">
			{classes && classes.card ? classes.card as string : 'missing'}
		</div>
		<style
			ref={function (next: { card: string }) {
				classes = next;
			}}
		>
			.card {
				color: rgb(6, 5, 4);
			}
		</style>
	</>
}

export function IdentifierCallbackStyleRef() @{
	let classes;
	function takeMap(next: { card: string }) {
		classes = next;
	}
	<>
		<div id="id-callback" class="card">
			{classes && classes.card ? classes.card as string : 'missing'}
		</div>
		<style ref={takeMap}>
			.card {
				color: rgb(14, 15, 16);
			}
		</style>
	</>
}

export function CurrentStyleRef() @{
	const box = { current: null as { card: string } | null };
	<>
		<div id="current" class="card">
			{box.current && box.current.card ? box.current.card as string : 'missing'}
		</div>
		<style ref={box}>
			.card {
				color: rgb(3, 2, 1);
			}
		</style>
	</>
}

export function ValueStyleRef() @{
	const box = { value: null as { card: string } | null };
	<>
		<div id="value" class="card">
			{box.value && box.value.card ? box.value.card as string : 'missing'}
		</div>
		<style ref={box}>
			.card {
				color: rgb(11, 12, 13);
			}
		</style>
	</>
}

export function ReturnedStyleRef() {
	let classes;
	return <>
		<div id="returned" class="card">
			{classes && classes.card ? classes.card as string : 'missing'}
		</div>
		<style ref={classes}>
			.card {
				color: rgb(21, 22, 23);
			}
		</style>
	</>;
}
