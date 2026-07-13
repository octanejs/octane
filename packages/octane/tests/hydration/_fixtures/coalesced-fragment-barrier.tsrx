import { Fragment } from 'octane';

function FragmentLeaf(props: { fragmentRef: { current: unknown } }) @{
	<Fragment ref={props.fragmentRef}>
		<button class="fragment-barrier-button">fragment</button>
	</Fragment>
}

function FragmentMiddle(props: { fragmentRef: { current: unknown } }) {
	return <FragmentLeaf fragmentRef={props.fragmentRef} />;
}

export function FragmentBarrier(props: { fragmentRef: { current: unknown } }) {
	return <FragmentMiddle fragmentRef={props.fragmentRef} />;
}
