// Templates whose root element the server rendered without the nodes their
// compiled walk reaches, and a component that throws while it hydrates.

export function Link(props: { url: string }) @{
	<div>
		<a id="first" href={props.url}>
			{'p0wned'}
		</a>
	</div>
}

export function Bold(props: { t: string }) @{
	<div>
		<b>{props.t as string}</b>
	</div>
}

export function Deep(props: { url: string }) @{
	<div>
		<p>
			<a id="deep" href={props.url}>
				{'p0wned'}
			</a>
		</p>
	</div>
}

export function InBoundary(props: { url: string }) @{
	<main>
		<h1>{'title'}</h1>
		@try {
			<div>
				<a id="first" href={props.url}>
					{'p0wned'}
				</a>
			</div>
		} @pending {
			<i>{'loading'}</i>
		}
	</main>
}

let failures = 0;

/** The next `count` renders of `Fails` throw. */
export function failNext(count: number): void {
	failures = count;
}

function Fails() @{
	if (failures > 0) {
		failures--;
		throw new Error('hydrating render failed');
	}
	<i>{'ok'}</i>
}

export function Thrower() @{
	<div>
		<Fails />
		<b>{'tail'}</b>
	</div>
}
