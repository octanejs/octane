import { type OctaneNode } from 'octane';
import Flex from './Flex.tsrx';

import { getTileClasses } from './shared/utils.js';

import type { RangeType, Value } from './shared/types.js';

type TileGroupProps = {
	className?: string;
	count?: number;
	dateTransform: (point: number) => Date;
	dateType: RangeType;
	end: number;
	hover?: Date | null;
	offset?: number;
	renderTile: (props: { classes: string[]; date: Date }) => OctaneNode;
	start: number;
	step?: number;
	value?: Value;
	valueType: RangeType;
};

export default function TileGroup({
	className,
	count = 3,
	dateTransform,
	dateType,
	end,
	hover,
	offset,
	renderTile,
	start,
	step = 1,
	value,
	valueType,
}: TileGroupProps): OctaneNode {
	const tiles = [];
	for (let point = start; point <= end; point += step) {
		const date = dateTransform(point);

		tiles.push(
			renderTile({
				classes: getTileClasses({
					date,
					dateType,
					hover,
					value,
					valueType,
				}),
				date,
			}),
		);
	}

	return <Flex children={tiles} className={className} count={count} offset={offset} wrap />;
}
