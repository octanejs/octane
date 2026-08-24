import { use, useLayoutEffect } from 'octane';

export interface StructuralRootProps {
	shape: 'component' | 'branch' | 'root' | 'keyed' | 'empty';
	changed: boolean;
	promise: PromiseLike<string>;
	onLifecycle: (event: string) => void;
}

interface InputProps {
	onLifecycle: (event: string) => void;
}

function StructuralInput(props: InputProps) @{
	useLayoutEffect(() => {
		const input = document.getElementById('root-suspension-input');
		props.onLifecycle('input:mount');
		return () => props.onLifecycle(input?.isConnected ? 'input:cleanup' : 'input:cleanup-detached');
	}, [props.onLifecycle]);
	<section data-root-slot="before">
		<input id="root-suspension-input" defaultValue="initial browser value" />
	</section>
}

function StructuralReplacement(_props: InputProps) @{
	<section data-root-slot="after">{'replacement'}</section>
}

function StructuralReader(props: { promise: PromiseLike<string> }) @{
	const value = use(props.promise);
	<span id="root-suspension-value">{value as string}</span>
}

export function StructuralRoot(props: StructuralRootProps) @{
	const Current = props.changed ? StructuralReplacement : StructuralInput;
	const items =
		props.changed ? (props.shape === 'empty' ? [] : ['keep']) : ['remove', 'keep'];
	<main data-root-shape={props.shape}>
		@if (props.shape === 'keyed' || props.shape === 'empty') {
			<ul>
				@for (const item of items; key item) {
					<li data-root-key={item}>
						@if (item === 'remove') {
							<StructuralInput onLifecycle={props.onLifecycle} />
						} @else {
							<span>{'survivor'}</span>
						}
					</li>
				} @empty {
					<li data-root-empty>{'empty'}</li>
				}
			</ul>
		} @else {
			@if (props.shape === 'branch') {
				<section data-root-branch>
					@if (props.changed) {
						<StructuralReplacement onLifecycle={props.onLifecycle} />
					} @else {
						<StructuralInput onLifecycle={props.onLifecycle} />
					}
				</section>
			} @else {
				<Current onLifecycle={props.onLifecycle} />
			}
		}
		<StructuralReader promise={props.promise} />
	</main>
}

export function StructuralRootReplacement(props: StructuralRootProps) @{
	<article data-root-replacement>
		<StructuralReplacement onLifecycle={props.onLifecycle} />
		<StructuralReader promise={props.promise} />
	</article>
}
