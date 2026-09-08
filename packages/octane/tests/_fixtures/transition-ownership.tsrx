import { use, useState, useTransition } from 'octane';

export type TransitionOwnerName = 'first' | 'second' | 'third';

export interface TransitionOwnerControls {
	start: (action: () => void | Promise<unknown>) => void;
	setRequest: (request: PromiseLike<string>) => void;
	setValue: (value: number | ((previous: number) => number)) => void;
}

interface TransitionOwnerProps {
	name: TransitionOwnerName;
	initial: PromiseLike<string>;
	bind: (name: TransitionOwnerName, controls: TransitionOwnerControls) => void;
}

function TransitionOwner(props: TransitionOwnerProps) @{
	const [pending, start] = useTransition();
	const [request, setRequest] = useState(props.initial);
	const [value, setValue] = useState(0);
	props.bind(props.name, { start, setRequest, setValue });
	<section data-owner={props.name}>
		<output>{String(pending)}</output>
		<b>{String(value)}</b>
		@try {
			const text = use(request);
			<span>{text as string}</span>
		} @pending {
			<p>loading</p>
		}
	</section>
}

export function TransitionOwners(props: {
	owners: TransitionOwnerName[];
	initial: PromiseLike<string>;
	bind: (name: TransitionOwnerName, controls: TransitionOwnerControls) => void;
}) @{
	<div>
		@for (const name of props.owners; key name) {
			<div data-owner-scope={name}>
				@try {
					<TransitionOwner name={name} initial={props.initial} bind={props.bind} />
				} @catch (error) {
					<p>
						{error instanceof Error ? error.message : String(error)}
					</p>
				}
			</div>
		}
	</div>
}
