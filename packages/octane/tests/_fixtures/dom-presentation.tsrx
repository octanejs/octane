import { unbound } from 'octane/behavior';
import { Hydrate, use, type OctaneNode } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';
import type { SignalHandle } from 'octane/signals';
import type { SignalCSSProperties } from 'octane/jsx-runtime';

export interface ActionPresentationProps {
	type: SignalHandle<'submit' | 'button'>;
	disabled: SignalHandle<boolean>;
	label: SignalHandle<string>;
	sendHidden: SignalHandle<boolean>;
	stopHidden: SignalHandle<boolean>;
	classes: SignalHandle<string>;
	height$: SignalHandle<number>;
	opacity$: SignalHandle<number>;
	accent$: SignalHandle<string>;
	title?: string;
	onAction(event: MouseEvent): void;
	onReady?(element: Element | null): void;
}

export function ActionPresentation(props: ActionPresentationProps) @{
	'use dom bindings';
	<button
		id="early-action"
		type={props.type}
		disabled={props.disabled}
		aria-disabled={props.disabled}
		aria-label={props.label}
		className={props.classes}
		style={{ height: props.height$, opacity: props.opacity$, color: props.accent$ }}
		title={props.title}
		onClick={props.onAction}
		ref={props.onReady}
	>
		<span hidden={props.sendHidden}>
			<svg viewBox="0 0 24 24">
				<path d="M1 1h5" />
			</svg>
		</span>
		<span hidden={props.stopHidden}>
			<svg viewBox="0 0 24 24">
				<path d="M2 2h4" />
			</svg>
		</span>
	</button>
}

function ActionHydrationSuffix(props: { suspend: boolean; promise: Promise<void> }) @{
	if (props.suspend) use(props.promise);
	<span>{'Ready'}</span>
}

export function ActionHydration(props: ActionPresentationProps & {
	when: HydrationStrategy;
	suspend: boolean;
	promise: Promise<void>;
	onHydrated(): void;
}) @{
	<Hydrate
		when={props.when}
		split={false}
		fallback={<span id="action-fallback">{'Loading'}</span>}
		onHydrated={props.onHydrated}
	>
		<ActionPresentation
			type={props.type}
			disabled={props.disabled}
			label={props.label}
			sendHidden={props.sendHidden}
			stopHidden={props.stopHidden}
			classes={props.classes}
			height$={props.height$}
			opacity$={props.opacity$}
			accent$={props.accent$}
			title={props.title}
			onAction={props.onAction}
			onReady={props.onReady}
		/>
		<ActionHydrationSuffix suspend={props.suspend} promise={props.promise} />
	</Hydrate>
}

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

export interface NativeControlPresentationProps {
	draft: SignalHandle<string>;
	readOnly: SignalHandle<boolean>;
	disabled: SignalHandle<boolean>;
	required: SignalHandle<boolean>;
	placeholder: SignalHandle<string>;
}

export function NativeControlPresentation({
	draft: draft$,
	readOnly,
	disabled,
	required,
	placeholder,
}: NativeControlPresentationProps) @{
	'use dom bindings';
	<textarea
		value={unbound(draft$)}
		readOnly={readOnly}
		disabled={disabled}
		required={required}
		placeholder={placeholder}
	/>
}

export interface NativeControlHostProps {
	className: string | SignalHandle<string>;
	children?: OctaneNode;
	action?: string;
	inert?: boolean;
	onReady?(element: HTMLFormElement | null): void;
	onKeyDown?(event: KeyboardEvent): void;
}

export function NativeControlHost(props: NativeControlHostProps) @{
	'use dom bindings';
	<form
		class={props.className}
		action={unbound(props.action)}
		inert={unbound(props.inert)}
		ref={unbound(props.onReady)}
		onKeyDown={unbound(props.onKeyDown)}
	>{unbound(props.children)}</form>
}

export function NativeControlLayout(
	props: NativeControlPresentationProps & NativeControlHostProps,
) @{
	<NativeControlHost
		className={props.className}
		action={props.action}
		inert={props.inert}
		onReady={props.onReady}
		onKeyDown={props.onKeyDown}
	>
		<NativeControlPresentation
			draft={props.draft}
			readOnly={props.readOnly}
			disabled={props.disabled}
			required={props.required}
			placeholder={props.placeholder}
		/>
		<p>{'Message'}</p>
	</NativeControlHost>
}

export function NativeControlLayoutContainer(
	props: NativeControlPresentationProps & NativeControlHostProps,
) @{
	<section>
		<NativeControlLayout
			className={props.className}
			action={props.action}
			inert={props.inert}
			onReady={props.onReady}
			onKeyDown={props.onKeyDown}
			draft={props.draft}
			readOnly={props.readOnly}
			disabled={props.disabled}
			required={props.required}
			placeholder={props.placeholder}
		/>
		<aside>{'Sibling'}</aside>
	</section>
}

export function NativeControlSiblingPresentation({
	draft: draft$,
	readOnly,
	disabled,
	required,
	placeholder,
}: NativeControlPresentationProps) @{
	'use dom bindings';
	<section>
		<textarea
			value={unbound(draft$)}
			readOnly={readOnly}
			disabled={disabled}
			required={required}
			placeholder={placeholder}
		/>
		<span />
	</section>
}

export function NativeControlPairPresentation({
	first,
	second,
	onReady,
}: {
	first: SignalHandle<string>;
	second: SignalHandle<string>;
	onReady?: (element: HTMLElement | null) => void;
}) @{
	'use dom bindings';
	<section ref={onReady}>
		<textarea value={unbound(first)} />
		<textarea value={unbound(second)} />
	</section>
}

export function UnmatchedNativeControl({
	draft,
	readOnly,
	disabled,
	required,
	placeholder,
}: NativeControlPresentationProps) @{
	<textarea
		value={draft}
		readOnly={readOnly}
		disabled={disabled}
		required={required}
		placeholder={placeholder}
	/>
}

export function UnmatchedNativeControlSpread({
	fields,
	readOnly,
	disabled,
	required,
	placeholder,
}: NativeControlPresentationProps & { fields: Record<string, unknown> }) @{
	<textarea
		{...fields}
		readOnly={readOnly}
		disabled={disabled}
		required={required}
		placeholder={placeholder}
	/>
}

function NativeControlHydrationSuffix(props: {
	suspend: boolean;
	promise: Promise<void>;
}) @{
	if (props.suspend) use(props.promise);
	<span>{'Ready'}</span>
}

export function NativeControlHydration(props: NativeControlPresentationProps & {
	className: string;
	when: HydrationStrategy;
	suspend: boolean;
	promise: Promise<void>;
	onHydrated(): void;
}) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<NativeControlHost className={props.className}>
			<NativeControlPresentation
				draft={props.draft}
				readOnly={props.readOnly}
				disabled={props.disabled}
				required={props.required}
				placeholder={props.placeholder}
			/>
			<NativeControlHydrationSuffix suspend={props.suspend} promise={props.promise} />
		</NativeControlHost>
	</Hydrate>
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
