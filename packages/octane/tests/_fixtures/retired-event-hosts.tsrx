import { createPortal, useLayoutEffect, useState } from 'octane';
import { useSignal$ } from 'octane/signals/client';

type Props = {
	readonly observe: (entry: string) => void;
	readonly restore: HTMLElement;
	readonly show?: boolean;
};

// A dialog-style focus restore: the deletion cleanup moves focus while the
// focused input is still attached, after its parent's signal scope retired.
function RestoreFocus({ restore }: Pick<Props, 'restore'>) @{
	useLayoutEffect(() => () => restore.focus(), []);
	<input />
}

export function SignalForm({ observe, restore }: Props) @{
	const count$ = useSignal$(0);
	<form
		onBlur={() => {
			observe('blur');
			count$.set(1);
			observe('write');
		}}
	>
		<RestoreFocus restore={restore} />
		<output>{count$.get() as number}</output>
	</form>
}

export function Toggle({ observe, restore, show }: Props) @{
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<SignalForm observe={observe} restore={restore} />
		}
	</section>
}

// The same restore, rendering nothing focusable.
function Restore({ restore }: Pick<Props, 'restore'>) @{
	useLayoutEffect(() => () => restore.focus(), []);
	<i />
}

// A child component, with a Block of its own, owns the focused input.
function Field({
	observe,
	onCommit,
}: {
	readonly observe: (entry: string) => void;
	readonly onCommit: () => void;
}) @{
	const [draft] = useState('draft');
	<input
		data-draft={draft}
		onBlur={() => {
			observe('field');
			onCommit();
		}}
	/>
}

// The deletion root restores focus in its own layout cleanup, which runs before
// the teardown reaches its Field child.
function Dialog({ observe, restore }: Props) @{
	const value$ = useSignal$(0);
	useLayoutEffect(() => () => restore.focus(), []);
	<form>
		<Field observe={observe} onCommit={() => value$.set(1)} />
		<output>{value$.get() as number}</output>
	</form>
}

export function DialogToggle({ observe, restore, show }: Props) @{
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<Dialog observe={observe} restore={restore} />
		}
	</section>
}

type PortalProps = Props & { readonly target: HTMLElement };

// A top-level portal: its DOM lies outside every range the deletion removes, and
// its events route to the live section.
function PortaledDialog({ observe, restore, target }: PortalProps) {
	return createPortal(<Dialog observe={observe} restore={restore} />, target);
}

export function PortalToggle({ observe, restore, show, target }: PortalProps) @{
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<PortaledDialog observe={observe} restore={restore} target={target} />
		}
	</section>
}

// The same dialog through a portal compiled in a template; its events route
// through the wrapper.
function TemplatePortaledDialog({ observe, restore, target }: PortalProps) @{
	<div>{createPortal(<Dialog observe={observe} restore={restore} />, target)}</div>
}

export function TemplatePortalToggle({ observe, restore, show, target }: PortalProps) @{
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<TemplatePortaledDialog observe={observe} restore={restore} target={target} />
		}
	</section>
}

// A value hole's input has a Block of its own, below the row. The restoring
// component sits before it in the row.
export function EditableRows({
	observe,
	restore,
	rows,
	editing,
}: Props & {
	readonly rows: readonly number[];
	readonly editing: number;
}) @{
	<section onBlur={() => observe('parent')}>
		@for (const row of rows; key row) {
			<div>
				<Restore restore={restore} />
				{editing === row ? <input onBlur={() => observe('row')} /> : null}
			</div>
		}
	</section>
}

// A live input beside the deleted arm.
export function SiblingToggle({ observe, restore, show }: Props) @{
	<section onBlur={() => observe('parent')}>
		<input class="sibling" onBlur={() => observe('sibling')} />
		@if (show) {
			<SignalForm observe={observe} restore={restore} />
		}
	</section>
}
