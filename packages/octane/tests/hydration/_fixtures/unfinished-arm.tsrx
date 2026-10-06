// A Suspense boundary that renderToString could not finish, so it sent the
// boundary's @pending arm, beside a leaf that suspends a hydrating attempt
// while `gate.promise` holds a promise.
import { use } from 'octane';

/** The boundary's data, as a module-level cached request is. */
export const data: { promise?: Promise<string> } = {};
export const gate: { promise?: Promise<void> } = {};

function wait(promise: Promise<void> | undefined): string {
	if (promise !== undefined) use(promise);
	return 'ok';
}

function GateLeaf() @{
	<u>{wait(gate.promise) as string}</u>
}

function Reader() @{
	<i>{use(data.promise!) as string}</i>
}

// GateLeaf suspends the root's attempt.
export function Unfinished() @{
	<div>
		@try {
			<Reader />
		} @pending {
			<p>{'pending'}</p>
		}
		<GateLeaf />
	</div>
}

// GateLeaf suspends the attempt of an enclosing arm that the server resolved.
export function InArm() @{
	<div>
		@try {
			<section>
				@try {
					<Reader />
				} @pending {
					<p>{'pending'}</p>
				}
				<GateLeaf />
			</section>
		} @pending {
			<s>{'outer'}</s>
		}
	</div>
}
