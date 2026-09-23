import { createContext, useState, type OctaneNode } from 'octane';

const Context = createContext(0);

function Late(props: { show: boolean }) {
	if (!props.show) return null;
	return <p class="late">late content</p>;
}

function LateProvided(props: { show: boolean }) {
	if (!props.show) return null;
	return <Context value={1}>
		<p class="late">late content</p>
	</Context>;
}

function Root(props: { children?: OctaneNode }) {
	return <Context value={1}>{props.children as never}</Context>;
}

function Case(props: { variant: 'a' | 'b' | 'c' | 'd' }) {
	const [show, setShow] = useState(false);
	return <section id={props.variant}>
		<button onClick={() => setShow(!show)}>
			{show ? 'close' : 'open'}
		</button>
		{props.variant === 'a'
			? <Context value={1}>
					<Late show={show} />
				</Context>
			: props.variant === 'b'
				? <LateProvided show={show} />
				: props.variant === 'c'
					? <Root>
							<LateProvided show={show} />
						</Root>
					: <Root>
							<Late show={show} />
						</Root>}
	</section>;
}

export function LateProviderApp() {
	return <main>
		<Case variant="a" />
		<Case variant="b" />
		<Case variant="c" />
		<Case variant="d" />
	</main>;
}
