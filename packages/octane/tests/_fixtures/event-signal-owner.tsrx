export function OwnerButton(props: { invoke: () => void }) @{
	<button onClick={props.invoke}>read</button>
}

export function OwnerBubble(props: { remove: () => void; bubble: () => void }) @{
	<main onClick={props.bubble}>
		<button onClick={props.remove}>remove</button>
	</main>
}

export function HeldOwnerButton(props: { invoke: () => void; wait: () => void }) @{
	<section>
		@try {
			<div>
				<button onClick={props.invoke}>read</button>
				@{
					props.wait();
				}
			</div>
		} @pending {
			<p>pending</p>
		}
	</section>
}

type BundleOwnerProps = {
	invoke: (...values: unknown[]) => void;
	value: string;
	other: string;
	last: string;
	wait: () => void;
};

export function BundleOwner0({ invoke, wait }: BundleOwnerProps) @{
	<section>
		@try {
			<div>
				<button onClick={() => invoke()}>read</button>
				@{
					wait();
				}
			</div>
		} @pending {
			<p>pending</p>
		}
	</section>
}

export function BundleOwner1({ invoke, value, wait }: BundleOwnerProps) @{
	<section>
		@try {
			<div>
				<button onClick={() => invoke(value)}>read</button>
				@{
					wait();
				}
			</div>
		} @pending {
			<p>pending</p>
		}
	</section>
}

export function BundleOwner2({ invoke, value, other, wait }: BundleOwnerProps) @{
	<section>
		@try {
			<div>
				<button onClick={() => invoke(value, other)}>read</button>
				@{
					wait();
				}
			</div>
		} @pending {
			<p>pending</p>
		}
	</section>
}

export function BundleOwnerN({ invoke, value, other, last, wait }: BundleOwnerProps) @{
	<section>
		@try {
			<div>
				<button onClick={() => invoke(value, other, last)}>read</button>
				@{
					wait();
				}
			</div>
		} @pending {
			<p>pending</p>
		}
	</section>
}

export function BundleOwner1e({ invoke, wait }: BundleOwnerProps) @{
	<section>
		@try {
			<div>
				<button
					onClick={(event) => {
						const type = event.type;
						invoke(type);
					}}
				>read</button>
				@{
					wait();
				}
			</div>
		} @pending {
			<p>pending</p>
		}
	</section>
}

export function BundleOwner2e({ invoke, value, wait }: BundleOwnerProps) @{
	<section>
		@try {
			<div>
				<button
					onClick={(event) => {
						const type = event.type;
						invoke(type, value);
					}}
				>read</button>
				@{
					wait();
				}
			</div>
		} @pending {
			<p>pending</p>
		}
	</section>
}

export function BundleOwnerBubble({ remove, bubble }: { remove: () => void; bubble: () => void }) @{
	<main onClick={() => bubble()}>
		<button onClick={() => remove()}>replace</button>
	</main>
}

export function OwnerCapture({ remove, bubble }: { remove: () => void; bubble: () => void }) @{
	<main onClickCapture={remove}>
		<button onClickCapture={bubble}>replace</button>
	</main>
}

export function BundleOwnerCapture({
	remove,
	bubble,
}: {
	remove: () => void;
	bubble: () => void;
}) @{
	<main onClickCapture={() => remove()}>
		<button onClickCapture={() => bubble()}>replace</button>
	</main>
}
