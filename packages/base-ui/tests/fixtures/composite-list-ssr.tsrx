import { type RefObject } from 'octane';
import { CompositeList } from '../../src/internals/composite/list/CompositeList.tsrx';
import { useCompositeListItem } from '../../src/internals/composite/list/useCompositeListItem';

function Item(props: { label: string }) {
	const { ref, index } = useCompositeListItem();
	return <div ref={ref} data-testid={props.label} data-index={index} />;
}
export function CompositeListFixture({
	elementsRef,
}: {
	elementsRef: RefObject<Array<HTMLElement | null>>;
}) {
	return <CompositeList elementsRef={elementsRef}>
		<Item label="a" />
		<Item label="b" />
	</CompositeList>;
}
