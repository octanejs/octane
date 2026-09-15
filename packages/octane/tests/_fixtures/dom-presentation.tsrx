import { unbound } from 'octane/behavior';
import type { SignalHandle } from 'octane/signals';
import type { SignalCSSProperties } from 'octane/jsx-runtime';

interface SubmitProps {
	label: string;
	disabled: boolean;
	pending: boolean;
}

function SubmitButton(props: SubmitProps) @{
	<button type="submit" disabled={props.disabled} aria-busy={props.pending}>
		@if (props.pending) {
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M8 1v3" />
			</svg>
		}
		<span>{props.label as string}</span>
	</button>
}

export interface LoginPresentationProps {
	label: string;
	error: string;
	pending: boolean;
	submitLabel: string;
}

export function LoginPresentation(props: LoginPresentationProps) @{
	'use dom bindings';
	<form action={unbound('/login')} method="post" aria-busy={props.pending}>
		<label>
			{props.label as string}
			<input name="email" type="email" disabled={props.pending} aria-invalid={props.error !== ''} />
		</label>
		<p role="status" hidden={props.error === ''}>{props.error as string}</p>
		<SubmitButton label={props.submitLabel} disabled={props.pending} pending={props.pending} />
	</form>
}

export interface AttachmentPresentationItem {
	id: string;
	name: string;
	preview: string | null;
	state: 'uploading' | 'ready' | 'error';
	error: string;
}

export interface AttachmentPresentationProps {
	items: readonly AttachmentPresentationItem[];
	locked: boolean;
	onRemove(id: string): void;
	onRetry(id: string): void;
	onInput?: | ((element: Element | null) => void | (() => void))
	| { current: HTMLInputElement | null }
	| null;
}

export function AttachmentPresentation(props: AttachmentPresentationProps) @{
	'use dom bindings';
	<>
		@for (const item of props.items; key item.id) {
			<figure data-file={item.id} aria-busy={item.state === 'uploading'}>
				<input name={unbound(item.id)} defaultValue={unbound(item.name)} ref={props.onInput} />
				<figcaption>{item.name as string}</figcaption>
				@if (item.preview !== null) {
					<img src={item.preview} alt={item.name} />
				}
				@if (item.state === 'uploading') {
					<span role="status">Uploading…</span>
				} @else if (item.state === 'error') {
					<button type="button" onClick={() => props.onRetry(item.id)} title={item.error}>
						Retry
					</button>
				}
				<button type="button" disabled={props.locked} onClick={() => props.onRemove(item.id)}>
					Remove
				</button>
			</figure>
		} @empty {
			<span role="status">No attachments</span>
		}
	</>
}

export interface SafetyPresentationProps {
	visible: boolean;
	title: string;
	message: string;
	actions: readonly { id: string; label: string; href: string | null }[];
	onAction(id: string): void;
}

export function SafetyPresentation(props: SafetyPresentationProps) @{
	'use dom bindings';
	<>
		@if (props.visible) {
			<section role="alert">
				<strong>{props.title as string}</strong>
				@if (props.message !== '') {
					<p>{props.message as string}</p>
				}
				<div>
					@for (const action of props.actions; key action.id) {
						@if (action.href !== null) {
							<a href={action.href}>{action.label as string}</a>
						} @else {
							<button
								type="button"
								onClick={() => props.onAction(action.id)}
							>{action.label as string}</button>
						}
					}
				</div>
			</section>
		}
	</>
}

export function AdjacentPresentation(props: { first: string; last: string }) @{
	'use dom bindings';
	<p>Before {props.first as string}{props.last as string} after</p>
}

export function InlineRefPresentation(props: {
	onAttach(element: Element | null): void | (() => void);
	title: string;
}) @{
	'use dom bindings';
	<input title={props.title} ref={(node) => props.onAttach(node)} />
}

export function SignalRowPresentation(props: {
	items: readonly {
		id: string;
		label: SignalHandle<string> | string;
		progress: SignalHandle<number> | number;
		classes: SignalHandle<string> | string;
	}[];
}) @{
	'use dom bindings';
	<>
		@for (const item of props.items; key item.id) {
			<figure data-row={item.id} class={item.classes} style={{ '--progress': item.progress }}>
				<input defaultValue={unbound('native')} />
				<figcaption>{item.label}</figcaption>
			</figure>
		}
	</>
}

export function SignalTextPresentation(props: {
	value: SignalHandle<string | number | boolean | null> | string | number | boolean | null;
}) @{
	'use dom bindings';
	<p>{props.value}</p>
}

export interface ControlPresentationProps {
	draft: SignalHandle<string>;
	checked: SignalHandle<boolean>;
	title: string;
}

export function ControlPresentation(props: ControlPresentationProps) @{
	'use dom bindings';
	<section title={props.title}>
		<input type="text" value={props.draft} />
		<input type="checkbox" checked={props.checked} />
	</section>
}

export function SampledControlPresentation(props: {
	draft: SignalHandle<string>;
	checked: SignalHandle<boolean>;
	plain: string;
}) @{
	'use dom bindings';
	<section>
		<input value={props.draft.get()} />
		<input type="checkbox" checked={props.checked.get()} />
		<textarea value={props.plain} />
	</section>
}

export function RadioControlPresentation(props: {
	first: SignalHandle<boolean>;
	second: SignalHandle<boolean>;
}) @{
	'use dom bindings';
	<section>
		<input type="radio" name="reentrant-choice" checked={props.second} />
		<input type="radio" name="reentrant-choice" checked={props.first} />
	</section>
}

export function ControlRowsPresentation(props: {
	items: readonly { id: string; draft: SignalHandle<string> }[];
}) @{
	'use dom bindings';
	<>
		@for (const item of props.items; key item.id) {
			<label data-control={item.id}>
				<input value={item.draft} />
				<span>{item.id as string}</span>
			</label>
		}
	</>
}

export function ControlSelectPresentation(props: {
	values: SignalHandle<readonly string[]>;
	options: readonly string[];
}) @{
	'use dom bindings';
	<select multiple value={props.values}>
		@for (const option of props.options; key option) {
			<option value={unbound(option)}>{option as string}</option>
		}
	</select>
}

export function WholeStylePresentation(props: {
	styles: SignalCSSProperties | string | SignalHandle<SignalCSSProperties | string | null> | null;
}) @{
	'use dom bindings';
	<section style={props.styles}>
		<input defaultValue={unbound('native')} />
	</section>
}

export function SpreadStylePresentation(props: {
	base: SignalCSSProperties;
	left: SignalHandle<number>;
	extra: SignalCSSProperties;
}) @{
	'use dom bindings';
	<section style={{ ...props.base, left: props.left, ...props.extra }} />
}

export function StringProjectionPresentation(props: {
	account: { name: string } | null;
	identifier: string;
}) @{
	'use dom bindings';
	<span title={(props.account?.name.trim() || props.identifier).slice(0, 1).toUpperCase()} />
}
