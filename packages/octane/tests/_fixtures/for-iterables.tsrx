export function Rows({ items }: { items: Iterable<string> }) @{
	<ul>
		@for (const item of items; key item) {
			<li data-item={item}>
				<input defaultValue={item} />
			</li>
		} @empty {
			<li data-empty="">Empty</li>
		}
	</ul>
}

export function SafeRows({ items }: { items: Iterable<string> }) @{
	@try {
		<Rows items={items} />
	} @catch (error, reset) {
		<div>
			<p>Unavailable</p>
			<button onClick={() => reset()}>Retry</button>
		</div>
	}
}
