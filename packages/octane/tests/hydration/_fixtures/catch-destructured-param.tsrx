// `@catch` parameters written as destructuring patterns. Each boundary renders
// its error arm from the bindings the pattern declares, and the server and the
// client render the same error output. A caught value is `unknown`, so, as with
// a TypeScript `catch` clause, a pattern is annotated `any`.

export type Failure = { failed: boolean };

export type Props = {
	state: Failure;
	label: string;
	thrown?: unknown;
};

function Result(props: { state: Failure; label: string; thrown?: unknown }) @{
	if (props.state.failed) throw props.thrown ?? new Error(props.label + ' failed');
	<p class="ok">{props.label + ' ready'}</p>
}

// An annotated object pattern beside the reset parameter.
export function AnnotatedPattern(props: Props) @{
	<div>
		@try {
			<Result state={props.state} label={props.label} />
		} @catch ({ message }: any, retry) {
			<button
				class="retry"
				onClick={() => {
					props.state.failed = false;
					retry();
				}}
			>{message as string}</button>
		}
	</div>
}

// A pattern default reads a component local, and a pattern binding shadows a
// component local of the same name.
export function DefaultFromParent(props: Props) @{
	const fallback = props.label + ' fallback';
	const message = props.label + ' outer';
	<div>
		<span class="outer">{message}</span>
		@try {
			<Result state={props.state} label={props.label} thrown={props.thrown} />
		} @catch ({ message = fallback, code }: any) {
			<p class="caught">{message + ':' + code}</p>
		}
	</div>
}

// An array pattern.
export function ArrayPattern(props: Props) @{
	<div>
		@try {
			<Result state={props.state} label={props.label} thrown={props.thrown} />
		} @catch ([first, second = props.label]: any) {
			<p class="caught">{first + '+' + second}</p>
		}
	</div>
}
