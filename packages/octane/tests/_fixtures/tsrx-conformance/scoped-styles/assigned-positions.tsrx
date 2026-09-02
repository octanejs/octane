// Assigned blocks in every declaration position. Exported (directly or via
// an export list) blocks keep every selector; local unapplied ones keep only
// their class selectors.
export const exported = <style>
	.exported {
		--label: exported;
	}
	div {
		color: red;
	}
</style>;

const local = <style>
	.local {
		--label: local;
	}
	em {
		color: red;
	}
</style>;

const reexported = <style>
	.reexported {
		--label: reexported;
	}
	span {
		color: red;
	}
</style>;
export { reexported };

const renamed = <style>
	.renamed {
		--label: renamed;
	}
	strong {
		color: red;
	}
</style>;
export { renamed as alias };

function helper() {
	const inFunction = <style>
		.inFunction {
			--label: inFunction;
		}
		i {
			color: red;
		}
	</style>;
	return inFunction;
}

export function Positions() @{
	const inBody = <style>
		.inBody {
			--label: inBody;
		}
		b {
			color: red;
		}
	</style>;
	{
		const inBlock = <style>
			.inBlock {
				--label: inBlock;
			}
			u {
				color: red;
			}
		</style>;
		console.log(inBlock);
	}
	<>
		<div class={local.local}>{'local'}</div>
		<div class={inBody.inBody}>{'body'}</div>
		@{
			const inNested = <style>
				.inNested {
					--label: inNested;
				}
				s {
					color: red;
				}
			</style>;
			<div class={inNested.inNested}>{'nested'}</div>
		}
		<div class={helper().inFunction}>{'function'}</div>
	</>
}
