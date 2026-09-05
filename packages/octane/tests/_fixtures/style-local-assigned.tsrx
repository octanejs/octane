// Assigned <style> blocks lower anywhere a declaration is legal: inside a
// component body, a nested `@{}`, a plain function, and a block statement.
// Each injects at its declaration position and becomes a class map.
function helper() {
	const inFunction = <style>
		.laFn {
			color: rgb(41, 0, 0);
		}
	</style>;
	return inFunction;
}

export function LocalAssigned() @{
	const inBody = <style>
		.laBody {
			color: rgb(42, 0, 0);
		}
		i {
			color: rgb(1, 1, 1);
		}
	</style>;
	let fromBlock = '';
	{
		const inBlock = <style>
			.laBlock {
				color: rgb(43, 0, 0);
			}
		</style>;
		fromBlock = inBlock.laBlock;
	}
	<>
		<div id="la-body" class={inBody.laBody}>{'body'}</div>
		<div id="la-block" class={fromBlock}>{'block'}</div>
		@{
			const inNested = <style>
				.laNested {
					color: rgb(44, 0, 0);
				}
			</style>;
			<div id="la-nested" class={inNested.laNested}>{'nested'}</div>
		}
		<div id="la-fn" class={helper().laFn}>{'function'}</div>
	</>
}

// An exported theme applied by a component declared later in the file: the
// applied class is a static literal, and the theme keeps every selector.
export const late = <style>
	.laLate {
		color: rgb(45, 0, 0);
	}
	div {
		padding: 3px;
	}
</style>;

export function AppliesLater() @{
	<>
		<style apply={late} />
		<div id="la-late" class="laLateHost">{'late'}</div>
	</>
}
