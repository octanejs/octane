// RFC problem 4: an element assigned to a variable is a scope of its own,
// at module scope and inside a component body alike.
const card = <div class="card-root card">
	<style>
		.card {
			--label: card;
		}
		p {
			margin: 0;
		}
	</style>
	<p class="card-text">{'card'}</p>
</div>;

export function Templates() @{
	const chip = <span class="chip-root chip">
		<style>
			.chip {
				--label: chip;
			}
			b {
				font-weight: bold;
			}
		</style>
		<b class="chip-text">{'chip'}</b>
	</span>;
	<>
		{card}
		{chip}
		<p class="outside">{'outside'}</p>
	</>
}
