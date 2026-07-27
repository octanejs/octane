import { createElement, useState } from 'octane';

// A host rendered with NO children of its own — the shape a component uses when it fills an
// element imperatively (a DOM snapshot moved in with `replaceChildren`, a third-party widget).
function EmptyHost(props) {
	return createElement('div', { class: 'host', 'data-n': props.n });
}

export function ImperativeChildrenSurvive() @{
	const [n, setN] = useState(0);
	<div>
		<button class="bump" onClick={() => setN(n + 1)}>bump</button>
		<EmptyHost n={n} />
	</div>
}

// The same host, but the renderer DOES put children in it, then stops. Those are ours, so they
// have to go.
function OwnedHost(props) {
	return createElement(
		'div',
		{ class: 'owned' },
		props.show ? createElement('i', { class: 'mine' }) : null,
	);
}

export function OwnedChildrenStillClear() @{
	const [show, setShow] = useState(true);
	<div>
		<button class="toggle" onClick={() => setShow(false)}>hide</button>
		<OwnedHost show={show} />
	</div>
}

// Renders children, then stops. Once ours are gone the element is unowned again, so content put
// there afterwards belongs to whoever put it there.
function ClearingHost(props) {
	return createElement(
		'div',
		{ class: 'clearing', 'data-n': props.n },
		props.show ? createElement('i', { class: 'mine' }) : null,
	);
}

export function ForeignDomAfterOurChildrenClear() @{
	const [step, setStep] = useState(0);
	<div>
		<button class="next" onClick={() => setStep(step + 1)}>next</button>
		<ClearingHost show={step === 0} n={step} />
	</div>
}

// A host that renders children, plus a second host rendered empty. Used to check what happens when
// previously-rendered nodes are moved (not cloned) into the empty one.
function SourceHost(props) {
	return createElement('div', { class: 'source' }, createElement('i', { class: 'moved' }));
}
function SinkHost(props) {
	return createElement('div', { class: 'sink', 'data-n': props.n });
}

export function MovedRenderedNodes() @{
	const [n, setN] = useState(0);
	<div>
		<button class="bump" onClick={() => setN(n + 1)}>bump</button>
		<SourceHost />
		<SinkHost n={n} />
	</div>
}
