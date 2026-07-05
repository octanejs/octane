// Regression fixtures for compiler-helper shadowing: every component (or the
// module scope) declares a user binding named after a runtime helper the
// compiled output calls. Generated code references helpers via collision-proof
// `_$` aliases (`import { setText as _$setText } from 'octane'`), so these
// bindings must never hijack it. `const [text, setText] = useState('')` is the
// canonical collision — React's most common naming for text state.
import { useState } from 'octane';

// Module-scope collisions: with bare helper imports these were duplicate-
// declaration SyntaxErrors against the prelude's `import { template, clone,
// delegateEvents }` (this module needs all three).
function template(s: string): string {
	return s + '!';
}
const clone = (s: string) => s + s;
const delegateEvents = 'not-the-runtime';

export function ShadowSetText() @{
	const [text, setText] = useState('');
	<div>
		<button id="st-btn" onClick={() => setText('xyz')}>{'go'}</button>
		<span id="st-label">
			{text as string}
		</span>
	</div>
}

// `htext` shadows the mount-path text helper (create+append the text node).
export function ShadowHtext(props: { value: string }) @{
	const htext = props.value;
	<span id="ht-label">
		{htext as string}
	</span>
}

// Locals named after the attr/style/class/walk helpers used by this template.
export function ShadowUpdateHelpers() @{
	const [n, bump] = useState(0);
	const setAttribute = 'data-' + n;
	const setStyle =
		n > 0 ? 'red' : 'blue';
	const setClassName = 'c' + n;
	const normalizeClass = 'n' + n;
	const child = 'kid-' + n;
	const sibling = 'sib-' + n;
	<div>
		<button id="u-btn" onClick={() => bump(n + 1)}>{'go'}</button>
		<span id="u-attr" title={setAttribute}>
			{child as string}
			{' '}
			{sibling as string}
		</span>
		<i id="u-style" style={{ color: setStyle }} class={setClassName}>{'x'}</i>
		<b id="u-class" class={[normalizeClass]}>{'y'}</b>
	</div>
}

function Row(props: { label: string }) @{
	<li>
		{props.label as string}
	</li>
}

// Locals named after the control-flow / component-slot helpers.
export function ShadowBlocks() @{
	const [on, setOn] = useState(true);
	const ifBlock = 'yes';
	const forBlock = [{ id: 'a' }, { id: 'b' }];
	const componentSlot = '-row';
	<div>
		<button id="b-btn" onClick={() => setOn(!on)}>{'t'}</button>
		@if (on) {
			<em id="b-if">
				{ifBlock as string}
			</em>
		}
		<ul id="b-list">
			@for (const x of forBlock; key x.id) {
				<Row label={x.id + componentSlot} />
			}
		</ul>
	</div>
}

export function ShadowModuleScope() @{
	<p id="m-label">
		{template(clone('ab')) as string}
		{' '}
		{delegateEvents as string}
	</p>
}
