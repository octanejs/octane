import { createContext, use, useEffect, useLayoutEffect, useState } from 'octane';

const LabelContext = createContext('missing');

function KeyedRow(props) @{
	const label = use(LabelContext);

	<view id={'row-' + props.item.id} ref={(handle) => props.captureRow(props.item.id, handle)}>
		<text>
			{label + ':' + props.item.value}
		</text>
	</view>
}

function MaybeThrows(props) @{
	if (props.fail) throw new Error('fixture render failure');

	<view id="healthy">
		<text>{'healthy'}</text>
	</view>
}

export function BackgroundRootFixture(props) @{
	const [count, setCount] = useState(0);

	useLayoutEffect(() => {
		props.log('layout:' + count);
		props.captureActions({
			increment() {
				setCount((value) => value + 1);
			},
		});
		return () => props.log('layout-cleanup:' + count);
	}, [count, props.captureActions, props.log]);

	useEffect(() => {
		props.log('passive:' + count);
		return () => props.log('passive-cleanup:' + count);
	}, [count, props.log]);

	<LabelContext.Provider value={props.label}>
		<>
			<view id="counter" ref={props.counterRef}>
				<text>
					{'Count: ' + count}
				</text>
			</view>
			@if (props.showDetails) {
				<view id="details">
					<text>{'details'}</text>
				</view>
			} @else {
				<view id="summary">
					<text>{'summary'}</text>
				</view>
			}
			<view id="rows">
				@for (const item of props.items; key item.id) {
					<KeyedRow item={item} captureRow={props.captureRow} />
				}
			</view>
			@try {
				<MaybeThrows fail={props.fail} />
			} @catch (error) {
				<view id="caught">
					<text>
						{error.message as string}
					</text>
				</view>
			}
		</>
	</LabelContext.Provider>
}
