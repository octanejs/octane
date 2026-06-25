// return-JSX host element containing `@switch` — folds to the return-based
// fragment model. The case/default bodies stay in the component (closure); the
// discriminant + the cases array (`[[test, caseFn], …]`) + the default fn thread
// as `props.hN` holes.
export function RetSwitch(props) {
	return <div>
		@switch (props.k) {
			@case 'a': {
				<span class="r">A</span>
			}
			@case 'b': {
				<span class="r">B</span>
			}
			@default: {
				<span class="r">D</span>
			}
		}
	</div>;
}

// `@{}` oracle — must produce byte-identical DOM (and update identically).
export function AtSwitch(props) @{
	<div>
		@switch (props.k) {
			@case 'a': {
				<span class="r">A</span>
			}
			@case 'b': {
				<span class="r">B</span>
			}
			@default: {
				<span class="r">D</span>
			}
		}
	</div>
}
