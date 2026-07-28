/** @jsxImportSource octane */
import { Fragment } from 'octane';

type IndexedItem = {
	id: number;
	label: string;
};

type IndexedMapProps = {
	items: IndexedItem[];
};

export function IndexKeyedHostMap(props: IndexedMapProps) {
	return (
		<ul>
			{props.items.map((item, index) => (
				<li key={index} data-id={item.id} data-index={index}>
					{index + ':' + item.label}
				</li>
			))}
		</ul>
	);
}

export function IndexKeyedFragmentMap(props: IndexedMapProps) {
	return (
		<ul>
			{props.items.map((item, index) => (
				<Fragment key={index}>
					<li data-id={item.id} data-index={index}>
						{index + ':' + item.label}
					</li>
				</Fragment>
			))}
		</ul>
	);
}

export function CompositeKeyedDestructuredMap(props: IndexedMapProps) {
	return (
		<ul>
			{props.items.map(({ id, label }, index) => (
				<li key={id + ':' + index} data-id={id} data-index={index}>
					{index + ':' + label}
				</li>
			))}
		</ul>
	);
}
