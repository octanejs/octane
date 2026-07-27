// The stage: runs the selected demo, or shows the `.tsrx` that produces it.
//
// The demo itself renders its own heading and blurb, so the stage adds only the
// Result/Source control — duplicating the title here would show it twice.
import { useState } from 'octane';
import type { Demo } from '../catalog';

interface DemoStageProps {
	demo: Demo;
}

type Tab = 'result' | 'source';

export function DemoStage(props: DemoStageProps) @{
	const [tab, setTab] = useState<Tab>('result');
	// Re-reading through `props` keeps the dynamic tag pointed at the current
	// demo when the route changes without the stage remounting.
	const Demo = props.demo.Component;

	<section class="demo-stage" aria-label={props.demo.title}>
		<div class="demo-stage-bar" role="tablist" aria-label="Demo view">
			<button
				type="button"
				role="tab"
				class={'demo-tab' + (tab === 'result' ? ' is-active' : '')}
				aria-selected={tab === 'result'}
				onClick={() => setTab('result')}
			>{'Result'}</button>
			<button
				type="button"
				role="tab"
				class={'demo-tab' + (tab === 'source' ? ' is-active' : '')}
				aria-selected={tab === 'source'}
				onClick={() => setTab('source')}
			>{'Source'}</button>
		</div>

		@if (tab === 'result') {
			<div class="demo-stage-body">
				<{Demo} />
			</div>
		} @else {
			<pre class="demo-source" tabindex="0">
				<code>{props.demo.source as string}</code>
			</pre>
		}
	</section>
}
