import { useState } from 'octane';

let readLabel: () => string = () => 'initial';

export function configureRead(read: () => string): void {
	readLabel = read;
}

function StaticDetail() @{
	<span>fixed</span>
}

function StaticChild() @{
	<section class="static-child">
		<StaticDetail />
		<em>tail</em>
	</section>
}

function StatefulChild() @{
	const [count, setCount] = useState(0);
	<section class="stateful">
		<button onClick={() => setCount(count + 1)}>{count as number}</button>
		<input defaultValue="seed" />
	</section>
}

function SetupChild() @{
	const label = readLabel();
	<span class="setup">{label as string}</span>
}

function DynamicChild() @{
	<span class="dynamic">{readLabel() as string}</span>
}

export function App(props: { visible: boolean; selected: string; tick: number }) @{
	<main data-tick={props.tick}>
		<div class="static-if">
			@if (props.visible) {
				<StaticChild />
			}
		</div>
		<div class="static-case">
			@switch (props.selected) {
				@case 'shown': {
					<StaticChild />
				}
				@default: {
					<em>hidden</em>
				}
			}
		</div>
		<div class="static-default">
			@switch (props.selected) {
				@case 'hidden': {
					<em>hidden</em>
				}
				@default: {
					<StaticChild />
				}
			}
		</div>
		@if (props.tick >= 0) {
			<StatefulChild />
		}
		@if (props.tick >= 0) {
			<SetupChild />
		}
		@if (props.tick >= 0) {
			<DynamicChild />
		}
	</main>
}
