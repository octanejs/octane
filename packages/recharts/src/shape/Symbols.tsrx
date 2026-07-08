// Port of shape/Symbols.tsx — the scatter/legend marker shapes, drawn by
// victory-vendor's d3-shape symbol generators (byte-identical `d` output).
import {
	symbol as shapeSymbol,
	symbolCircle,
	symbolCross,
	symbolDiamond,
	symbolSquare,
	symbolStar,
	symbolTriangle,
	symbolWye,
} from 'victory-vendor/d3-shape';
import { clsx } from 'clsx';
import { isNumber, upperFirst } from '../util/DataUtils';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';

const symbolFactories = {
	symbolCircle,
	symbolCross,
	symbolDiamond,
	symbolSquare,
	symbolStar,
	symbolTriangle,
	symbolWye,
};
const RADIAN = Math.PI / 180;

const getSymbolFactory = (type) => {
	const name = 'symbol' + upperFirst(type);
	return symbolFactories[name] || symbolCircle;
};

const calculateAreaSize = (size, sizeType, type) => {
	if (sizeType === 'area') {
		return size;
	}
	switch (type) {
		case 'cross':
			return (5 * size * size) / 9;
		case 'diamond':
			return (0.5 * size * size) / Math.sqrt(3);
		case 'square':
			return size * size;
		case 'star': {
			const angle = 18 * RADIAN;
			return 1.25 * size * size * (Math.tan(angle) - Math.tan(angle * 2) * Math.tan(angle) ** 2);
		}
		case 'triangle':
			return (Math.sqrt(3) * size * size) / 4;
		case 'wye':
			return ((21 - 10 * Math.sqrt(3)) * size * size) / 8;
		default:
			return (Math.PI * size * size) / 4;
	}
};

const registerSymbol = (key, factory) => {
	symbolFactories['symbol' + upperFirst(key)] = factory;
};

/** Renders a symbol from a set of predefined shapes. */
export function Symbols(symbolsProps) {
	const { type = 'circle', size = 64, sizeType = 'area', ...rest } = symbolsProps;
	const props = { ...rest, type, size, sizeType };
	// Runtime guard (recharts#6197): `type` can arrive as a non-string despite
	// the declared union; fall back to 'circle'.
	let realType = 'circle';
	if (typeof type === 'string') {
		realType = type;
	}
	const getSymbolPath = () => {
		const symbolFactory = getSymbolFactory(realType);
		const symbolGen = shapeSymbol().type(symbolFactory).size(
			calculateAreaSize(size, sizeType, realType),
		);
		const s = symbolGen();
		if (s === null) {
			return undefined;
		}
		return s;
	};
	const { className, cx, cy } = props;
	const filteredProps = svgPropertiesAndEvents(props);
	if (isNumber(cx) && isNumber(cy) && isNumber(size)) {
		return <path
			{...filteredProps}
			className={clsx('recharts-symbols', className)}
			transform={'translate(' + cx + ', ' + cy + ')'}
			d={getSymbolPath()}
		/>;
	}
	return null;
}

Symbols.registerSymbol = registerSymbol;
