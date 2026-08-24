import * as React from 'octane';
import { ActiveShape, ShapeAnimationProps, SymbolType } from './types';
import { ScatterPointItem } from '../cartesian/Scatter.tsrx';
import { InnerSymbolsProp, Symbols } from '../shape/Symbols.tsrx';
import { Shape } from './ActiveShapeUtils.tsrx';
import { DATA_ITEM_GRAPHICAL_ITEM_ID_ATTRIBUTE_NAME } from './Constants';
import { GraphicalItemId } from '../state/graphicalItemsSlice';

export type ScatterShapeProps =
	ScatterPointItem & ShapeAnimationProps & {
		isActive: boolean;
		index: number;
		[DATA_ITEM_GRAPHICAL_ITEM_ID_ATTRIBUTE_NAME]: GraphicalItemId;
	};

type ScatterSymbolShapeProps = ScatterShapeProps & Omit<InnerSymbolsProp, keyof ScatterShapeProps>;

function renderSymbols(props: ScatterSymbolShapeProps) {
	return <Symbols {...props} />;
}

const ScatterShape = Shape<ScatterSymbolShapeProps, SVGPathElement>;

export function ScatterSymbol({ option, ...props }: {
	option: ActiveShape<ScatterSymbolShapeProps, SVGPathElement> | SymbolType;
} & ScatterShapeProps) {
	if (typeof option === 'string') {
		return <ScatterShape
			option={<Symbols type={option} {...props} />}
			DefaultShape={renderSymbols}
			shapeProps={props}
		/>;
	}

	return <ScatterShape option={option} DefaultShape={renderSymbols} shapeProps={props} />;
}
