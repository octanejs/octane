import { useState, useId } from 'octane';

function ExpandButton({ click }: { click: () => void }) @{
	<button class="shown" onClick={click}>{'expand'}</button>
}

export function Toggle() @{
	const [on, setOn] = useState(true);
	const [expanded, setExpanded] = useState(false);
	<div>
		<button id="swap" onClick={() => setOn(!on)}>{'swap'}</button>
		<section>
			@if (on) {
				<>
					<ExpandButton click={() => setExpanded(!expanded)} />
					@if (expanded) {
						<p class="detail">{'detail'}</p>
					}
				</>
			} @else {
				<span class="hidden">{'replacement'}</span>
			}
		</section>
	</div>
}

export function SwitchToggle() @{
	const [on, setOn] = useState(true);
	const [expanded, setExpanded] = useState(false);
	<div>
		<button id="swap" onClick={() => setOn(!on)}>{'swap'}</button>
		<section>
			@switch (on) {
				@case true: {
					<>
						<ExpandButton click={() => setExpanded(!expanded)} />
						@if (expanded) {
							<p class="detail">{'detail'}</p>
						}
					</>
				}
				@default: {
					<span class="hidden">{'replacement'}</span>
				}
			}
		</section>
	</div>
}

export function MaybeDetail({ show }: { show: boolean }) @{
	<>
		@if (show) {
			<p class="detail">{'detail'}</p>
		}
	</>
}

export function LiteToggle() @{
	const [on, setOn] = useState(true);
	const [expanded, setExpanded] = useState(false);
	<div>
		<button id="swap" onClick={() => setOn(!on)}>{'swap'}</button>
		<section>
			@if (on) {
				<>
					<ExpandButton click={() => setExpanded(!expanded)} />
					<MaybeDetail show={expanded} />
				</>
			} @else {
				<span class="hidden">{'replacement'}</span>
			}
		</section>
	</div>
}

function SwapButton({ click }: { click: () => void }) @{
	<button id="swap" onClick={click}>{'swap'}</button>
}

export function NestedLiteToggle() @{
	const [on, setOn] = useState(true);
	const [expanded, setExpanded] = useState(false);
	<>
		@if (on) {
			<section class="nested">
				<SwapButton click={() => setOn(!on)} />
				<ExpandButton click={() => setExpanded(!expanded)} />
				<MaybeDetail show={expanded} />
			</section>
		} @else {
			<section>
				<SwapButton click={() => setOn(!on)} />
				<span class="hidden">{'replacement'}</span>
			</section>
		}
	</>
}

export function NestedDetail({ show }: { show: boolean }) @{
	<p class="detail">
		{show ? 'detail' : ''}
	</p>
}

export function ReplacementDetail({ show }: { show: boolean }) @{
	<span class="detail">
		{show ? 'detail' : ''}
	</span>
}

export function NestedComponentToggle({ UnknownComp }: { UnknownComp: typeof NestedDetail }) @{
	const [on, setOn] = useState(true);
	const [expanded, setExpanded] = useState(false);
	<div>
		<button id="swap" onClick={() => setOn(!on)}>{'swap'}</button>
		<button id="expand" onClick={() => setExpanded(!expanded)}>{'expand'}</button>
		<section>
			@if (on) {
				<div class="nested">
					<UnknownComp show={expanded} />
					<UnknownComp show={expanded} />
				</div>
			} @else {
				<span class="hidden">{'replacement'}</span>
			}
		</section>
	</div>
}

export function IfOnly() @{
	const [show, setShow] = useState(false);
	<div>
		<button onClick={() => setShow(!show)}>{'toggle'}</button>
		<section>
			@if (show) {
				<span class="maybe">{'shown'}</span>
			}
		</section>
	</div>
}

export function HookInIf() @{
	// Hooks inside an `@if` branch — uses our compile-time Symbol slots, so
	// toggling the branch destroys + recreates state (Block boundary semantics).
	const [show, setShow] = useState(true);
	<div>
		<button id="top" onClick={() => setShow(!show)}>{'toggle'}</button>
		<section>
			@if (show) {
				const [n, setN] = useState(0);
				<button id="inner" onClick={() => setN(n + 1)}>{n as string}</button>
			}
		</section>
	</div>
}

export function IdInComponent() @{
	const id = useId();
	<label for={id}>{id}</label>
}

// Regression pin for tsrx 0.1.29 commit 921fb9ce — fix(parser): control
// flow trailing text. Before the fix, `@if (…) {…} trail` swallowed the
// trailing text node into the control-flow body. The fixtures place
// `trailing!` / `tail` immediately after the closing `}` of an @if and
// an @for so any regression drops the text from the rendered output.
//
// WhitespaceInIf pins two intentional behaviors for a direct expression-only
// directive arm: stripTsOnlyWrappers keeps the TS assertion out of compiled
// JavaScript, and the ExpressionStatement remains setup rather than output.

export function IfTrailingText(props) @{
	<p>
		@if (props.show) {
			<span class="gated">{'yes'}</span>
		}
		trailing!
	</p>
}

export function ForTrailingText(props) @{
	<p>
		@for (const x of props.items; key x) {
			<span class="row">{x as string}</span>
		}
		tail
	</p>
}

export function WhitespaceInIf(props) @{
	<p>
		@if (props.show) {
			'  spaced  ' as string;
		}
	</p>
}
