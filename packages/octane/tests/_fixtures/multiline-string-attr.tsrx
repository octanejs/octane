// Fixture for multi-line JSX string attributes (see
// multiline-string-attrs.test.ts). The spread forces the hostValue binding
// path; the component props exercise the createElement/prop-bag and server
// warm-child paths, including prop names that are not JavaScript identifiers.
import { use } from 'octane';

type WarmPropInput = {
	'aria-label': string;
	'data-testid': string;
	title: string;
};

type WarmPropLoader = (ariaLabel: string, dataTestId: string, title: string) => Promise<string>;

function Chip(props: {
	'aria-label': string;
	'data-testid': string;
	title: string;
}) {
	return <span
		aria-label={props['aria-label']}
		data-testid={props['data-testid']}
		data-title={props.title}
	>{props.title as string}</span>;
}

export function SpreadHost(props: { rest?: Record<string, string> }) {
	return <div {...props.rest} class="one
		two" />;
}

export function PropChip() {
	return <Chip aria-label="accessible
				chip" data-testid="multiline-prop-chip" title="one
				two" />;
}

function WarmPropChip(props: WarmPropInput & { load: WarmPropLoader }) {
	const value = use(props.load(props['aria-label'], props['data-testid'], props.title));
	return <span data-warm-result={value}>{props.title as string}</span>;
}

export function WarmPropPage(props: { load: WarmPropLoader }) @{
	<main>
		@try {
			<WarmPropChip
				aria-label="accessible
					chip"
				data-testid="warmed-multiline-prop-chip"
				title="one
					two"
				load={props.load}
			/>
		} @pending {
			<i>pending</i>
		}
	</main>
}

export function OptionalComputedPropPage(props: {
	metadata: { 'aria-label': string } | null;
	load: (label: string) => Promise<string>;
}) @{
	const metadata = props.metadata;
	<main>
		@try {
			const value = use(props.load(metadata?.['aria-label'] ?? 'fallback'));
			<span data-optional-computed-result={value}>{value as string}</span>
		} @pending {
			<i>pending</i>
		}
	</main>
}
