import { ErrorBoundary } from 'octane';

// <ErrorBoundary> is lowered by a copy-on-write rewrite over the module body.
// Each component below buries one in a different property shape, so a rewriter
// that stops descending through any of them leaves the element unlowered and
// the boundary stops catching.

function Boom(props) @{
	if (props.explode) throw new Error('boom');
	<b class="out">{'ok'}</b>
}

export function DirectChild(props) @{
	<div>
		<ErrorBoundary fallback={<i class="out">{'caught'}</i>}>
			<Boom explode={props.explode} />
		</ErrorBoundary>
	</div>
}

export function InsideArrayOfChildren(props) @{
	<div>
		<span class="out">{'first'}</span>
		<ErrorBoundary fallback={<i class="out">{'caught'}</i>}>
			<Boom explode={props.explode} />
		</ErrorBoundary>
		<span class="out">{'last'}</span>
	</div>
}

export function InsideConditionalArm(props) @{
	<div>
		@if (props.on) {
			<ErrorBoundary fallback={<i class="out">{'caught'}</i>}>
				<Boom explode={props.explode} />
			</ErrorBoundary>
		} @else {
			<span class="out">{'off'}</span>
		}
	</div>
}

export function InsideKeyedLoop(props) @{
	<ul>
		@for (const item of props.items; key item.id) {
			<ErrorBoundary fallback={<i class="out">{'caught'}</i>}>
				<Boom explode={item.explode} />
			</ErrorBoundary>
		}
	</ul>
}

export function InsideNestedBoundary(props) @{
	<div>
		<ErrorBoundary fallback={<i class="out">{'outer'}</i>}>
			<ErrorBoundary fallback={<i class="out">{'caught'}</i>}>
				<Boom explode={props.explode} />
			</ErrorBoundary>
		</ErrorBoundary>
	</div>
}
