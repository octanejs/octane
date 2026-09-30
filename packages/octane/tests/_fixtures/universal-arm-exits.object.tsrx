// A directive arm ends early at `return;`, `return null;`, or a `continue;` that
// no inner loop owns, wherever the exit sits in the arm's setup. The universal
// compiler lowers each arm to a closure, so an exit ends that arm's output and
// the surrounding template carries on.

type Rows = { rows: string[]; hidden: string[] };

export function ForContinue(props: Rows) @{
	<list>
		@for (const row of props.rows; key row) {
			if (props.hidden.includes(row)) continue;
			<item name={row} />
		}
	</list>
}

// Each row takes the exit from a different nested statement. The inner loop's
// own `continue` and `break` stay JavaScript.
export function NestedContinue(props: Rows) @{
	<list>
		@for (const row of props.rows; key row) {
			const hide = props.hidden.includes(row);
			if (row === 'block') {
				if (hide) {
					continue;
				}
			}
			switch (row) {
				case 'switch':
					if (hide) continue;
					break;
				default:
					break;
			}
			try {
				if (row === 'try' && hide) continue;
			} finally {
			}
			let seen = 0;
			for (const char of row) {
				if (char === 'o') continue;
				if (char === 'p') break;
				seen++;
			}
			<item name={row} seen={seen} />
		}
	</list>
}

// `continue` in an arm nested inside a row ends only that inner arm.
export function InnerArmContinue(props: Rows) @{
	<list>
		@for (const row of props.rows; key row) {
			<item name={row}>
				@if (row !== '') {
					if (props.hidden.includes(row)) continue;
					<badge name={`${row}-badge`} />
				}
			</item>
		}
	</list>
}

// A `@{}` block is a nested template, not an arm: the jumps its setup owns stay
// JavaScript, and `continue` in the arm inside it ends only that arm.
export function BlockInnerArm(props: Rows) @{
	<list>
		@for (const row of props.rows; key row) {
			<item name={row}>@{
				let seen = 0;
				for (const char of row + 'xz') {
					if (char === 'x') continue;
					if (char === 'z') break;
					seen++;
				}
				@if (row !== '') {
					if (props.hidden.includes(row)) continue;
					<badge name={`${row}-${seen}`} />
				}
			}</item>
		}
	</list>
}

export function ArmKinds(props: Rows & { mode: number }) @{
	<list>
		@for (const row of props.rows; key row) {
			@if (props.mode === 0) {
				if (props.hidden.includes(row)) continue;
				<item name={`if-${row}`} />
			} @else if (props.mode === 1) {
				if (props.hidden.includes(row)) {
					continue;
				}
				<item name={`else-if-${row}`} />
			} @else {
				@switch (props.mode) {
					@case 2: {
						if (props.hidden.includes(row)) continue;
						<item name={`case-${row}`} />
					}
					@default: {
						@try {
							if (props.hidden.includes(row)) continue;
							<item name={`try-${row}`} />
						} @catch (error) {
							<item name="caught" />
						}
					}
				}
			}
		}
	</list>
}

export function IfReturn(props: { a: boolean; b: boolean; c: boolean }) @{
	<list>
		<item name="before" />
		@if (props.a) {
			if (props.b) return;
			<item name="a" />
		} @else {
			if (props.c) {
				return null;
			}
			<item name="else" />
		}
		<item name="after" />
	</list>
}
