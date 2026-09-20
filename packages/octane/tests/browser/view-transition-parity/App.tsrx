import {
	ViewTransition,
	createElement,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	type ViewTransitionProps,
} from 'octane';

declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				'parity-element': IntrinsicElements['div'];
			}
		}
	}
}

export interface AppProps {
	visible: boolean;
	optional?: { title: string } | null;
	generation: number;
	text: string;
	title: string;
	styles: Record<string, string>;
	transition: ViewTransitionProps;
	onOutsideClick: (generation: number) => void;
	controlledValue: string;
	controls: boolean;
	options: readonly { value: string; label: string }[];
	selected: string;
	textareaDefault: string;
	customValue: string;
	radioA: boolean;
	radioB: boolean;
	descriptor: string | null;
	rows: readonly { id: string; label: string; editable?: boolean }[];
	measure: boolean;
	nested: boolean;
	nestedTransition?: ViewTransitionProps;
	onInsertion: (generation: number) => void;
	onPassive: (generation: number, kind: 'mount' | 'cleanup') => void;
	onLayout: (generation: number) => void;
	onMeasuredRef: (element: HTMLElement | null) => void;
}

function OptionalSidebar(props: { item?: { title: string } }) {
	return props.item &&
		<ViewTransition exit="auto" default="none">
			<nav id="optional-sidebar">{props.item.title as string}</nav>
		</ViewTransition>;
}

export function App(props: AppProps) @{
	useInsertionEffect(() => props.onInsertion(props.generation), [props.generation]);
	useLayoutEffect(() => props.onLayout(props.generation), [props.generation]);
	useEffect(() => {
		props.onPassive(props.generation, 'mount');
		return () => props.onPassive(props.generation, 'cleanup');
	}, [props.generation]);
	<>
		<button id="outside" onClick={() => props.onOutsideClick(props.generation)}>
			Outside action
		</button>
		<output id="generation">{String(props.generation)}</output>
		@if (props.visible) {
			<ViewTransition {...props.transition}>
				<section id="panel" title={props.title} style={props.styles}>
					<input id="draft" defaultValue="draft" />
					<input id="controlled" value={props.controlledValue} readOnly />
					<span>{props.text as string}</span>
					@if (props.controls) {
						<div id="controls">
							<input
								id="radio-a"
								type="radio"
								name="staged-choice"
								checked={props.radioA}
								readOnly
							/>
							<input
								id="radio-b"
								type="radio"
								name="staged-choice"
								checked={props.radioB}
								readOnly
							/>
							<select id="selection" value={props.selected} onChange={() => {}}>
								@for (const option of props.options; key option.value) {
									<option value={option.value}>{option.label as string}</option>
								}
							</select>
							<textarea id="uncontrolled" defaultValue={props.textareaDefault} />
							<parity-element id="custom" data-marker={props.customValue} />
						</div>
					}
					{props.descriptor === null
						? null
						: createElement('aside', { id: 'descriptor' }, props.descriptor)}
					@for (const row of props.rows; key row.id) {
						<p data-row={row.id} contentEditable={row.editable}>{row.label as string}</p>
					}
					@if (props.measure) {
						<strong id="measured" ref={props.onMeasuredRef}>Font sample</strong>
					}
					@if (props.nested) {
						<ViewTransition name="inner" update="none" {...props.nestedTransition}>
							<div id="nested-panel">{props.text as string}</div>
						</ViewTransition>
					}
				</section>
			</ViewTransition>
		}
		@if (props.optional !== undefined) {
			<OptionalSidebar item={props.optional ?? undefined} />
		}
	</>
}
