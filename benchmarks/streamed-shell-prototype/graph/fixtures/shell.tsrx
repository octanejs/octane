import { Live } from './live.tsrx';
import { memo } from 'octane';
import { Named } from './barrel.ts';
import * as Widgets from './widgets.tsrx';
import { Widget } from './widgets.tsrx';
import './shell-effect.ts';
import { sharedLabel } from './shared.ts';

const MemoWidget = memo(Widget);
let Reassigned = () => <span>Initial</span>;
Reassigned = () => <span>Replacement</span>;

function StaticHeading() @{
	<h1>Static heading</h1>
}

function Uncalled() @{
	<i>Not rendered</i>
}

function ContainsUncalled() {
	function renderLater() {
		return <Uncalled />;
	}
	function renderShadowed(StaticHeading: typeof Uncalled) {
		return <StaticHeading />;
	}
	return <p
		data-render-factory-type={typeof renderLater}
		data-shadow-factory-type={typeof renderShadowed}
	>
		Nested functions are not called
	</p>;
}

export function Shell(props: { show: boolean }) @{
	<main>
		<StaticHeading />
		<ContainsUncalled />
		<p>{sharedLabel}</p>
		@if (props.show) {
			<Live />
		}
		<Named />
		<Widgets.Widget />
		<MemoWidget />
		<Reassigned />
	</main>
}
