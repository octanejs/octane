// Port of component/Text.tsx — the SVG text renderer with word wrapping,
// maxLines binary-search truncation, scaleToFit, and rotation. Measurement
// runs through the vendored getStringSize (0×0 under SSR, so SSR renders the
// unwrapped single line — same as upstream).
import { useMemo } from 'octane';
import { clsx } from 'clsx';
import { isNullish, isNumber, isNumOrStr } from '../util/DataUtils';
import { Global } from '../util/Global';
import { getStringSize } from '../util/DOMUtils';
import { reduceCSSCalc } from '../util/ReduceCSSCalc';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { isWellBehavedNumber } from '../util/isWellBehavedNumber';

const BREAKING_SPACES = /[ \f\n\r\t\v\u2028\u2029]+/;

const calculateWordWidths = ({ children, breakAll, style }) => {
	try {
		let words = [];
		if (!isNullish(children)) {
			if (breakAll) {
				words = children.toString().split('');
			} else {
				words = children.toString().split(BREAKING_SPACES);
			}
		}
		const wordsWithComputedWidth = words.map(
			(word) => ({
				word,
				width: getStringSize(word, style).width,
			}),
		);
		const spaceWidth = breakAll ? 0 : getStringSize(' ', style).width;
		return { wordsWithComputedWidth, spaceWidth };
	} catch {
		return null;
	}
};

export function isValidTextAnchor(value) {
	return value === 'start' || value === 'middle' || value === 'end' || value === 'inherit';
}

export function isRenderableText(val) {
	return isNullish(val) || typeof val === 'string' || typeof val === 'number' ||
		typeof val === 'boolean';
}

const calculate = (words, lineWidth, spaceWidth, scaleToFit) => words.reduce((
	result,
	{ word, width },
) => {
	const currentLine = result[result.length - 1];
	if (
		currentLine && width != null &&
			(lineWidth == null || scaleToFit ||
				currentLine.width + width + spaceWidth < Number(lineWidth))
	) {
		// Word can be added to an existing line
		currentLine.words.push(word);
		currentLine.width += width + spaceWidth;
	} else {
		// Add first word to line or word is too long to scaleToFit on existing line
		result.push({ words: [word], width });
	}
	return result;
}, []);

const findLongestLine = (words) => words.reduce((a, b) => (a.width > b.width ? a : b));

const suffix = '…';

const checkOverflow = (
	text,
	index,
	breakAll,
	style,
	maxLines,
	lineWidth,
	spaceWidth,
	scaleToFit,
) => {
	const tempText = text.slice(0, index);
	const words = calculateWordWidths({ breakAll, style, children: tempText + suffix });
	if (!words) {
		return [false, []];
	}
	const result = calculate(words.wordsWithComputedWidth, lineWidth, spaceWidth, scaleToFit);
	const doesOverflow =
		result.length > maxLines || findLongestLine(result).width > Number(lineWidth);
	return [doesOverflow, result];
};

const calculateWordsByLines = (
	{ maxLines, children, style, breakAll },
	initialWordsWithComputedWith,
	spaceWidth,
	lineWidth,
	scaleToFit,
) => {
	const shouldLimitLines = isNumber(maxLines);
	const text = String(children);
	const originalResult = calculate(initialWordsWithComputedWith, lineWidth, spaceWidth, scaleToFit);
	if (!shouldLimitLines || scaleToFit) {
		return originalResult;
	}
	const overflows =
		originalResult.length > maxLines || findLongestLine(originalResult).width > Number(lineWidth);
	if (!overflows) {
		return originalResult;
	}
	let start = 0;
	let end = text.length - 1;
	let iterations = 0;
	let trimmedResult;
	while (start <= end && iterations <= text.length - 1) {
		const middle = Math.floor((start + end) / 2);
		const prev = middle - 1;
		const [doesPrevOverflow, result] = checkOverflow(
			text,
			prev,
			breakAll,
			style,
			maxLines,
			lineWidth,
			spaceWidth,
			scaleToFit,
		);
		const [doesMiddleOverflow] = checkOverflow(
			text,
			middle,
			breakAll,
			style,
			maxLines,
			lineWidth,
			spaceWidth,
			scaleToFit,
		);
		if (!doesPrevOverflow && !doesMiddleOverflow) {
			start = middle + 1;
		}
		if (doesPrevOverflow && doesMiddleOverflow) {
			end = middle - 1;
		}
		if (!doesPrevOverflow && doesMiddleOverflow) {
			trimmedResult = result;
			break;
		}
		iterations++;
	}
	// Fallback to originalResult (result without trimming) if we cannot find
	// where to trim. This should not happen :tm:
	return trimmedResult || originalResult;
};

const getWordsWithoutCalculate = (children) => {
	const words =
		!isNullish(children) ? children.toString().split(BREAKING_SPACES) : [];
	return [
		{ words, width: undefined },
	];
};

export const getWordsByLines = ({ width, scaleToFit, children, style, breakAll, maxLines }) => {
	// Only perform calculations if using features that require them (multiline, scaleToFit)
	if ((width || scaleToFit) && !Global.isSsr) {
		const wordWidths = calculateWordWidths({ breakAll, children, style });
		if (!wordWidths) {
			return getWordsWithoutCalculate(children);
		}
		const { wordsWithComputedWidth, spaceWidth } = wordWidths;
		return calculateWordsByLines(
			{ breakAll, children, maxLines, style },
			wordsWithComputedWidth,
			spaceWidth,
			width,
			Boolean(scaleToFit),
		);
	}
	return getWordsWithoutCalculate(children);
};

const DEFAULT_FILL = '#808080';

export const textDefaultProps = {
	angle: 0,
	breakAll: false,
	// Magic number from d3
	capHeight: '0.71em',
	fill: DEFAULT_FILL,
	lineHeight: '1em',
	scaleToFit: false,
	textAnchor: 'start',
	// Maintain compat with existing charts / default SVG behavior
	verticalAnchor: 'end',
	x: 0,
	y: 0,
};

export function Text(outsideProps) @{
	const {
		x: propsX,
		y: propsY,
		lineHeight,
		capHeight,
		fill,
		scaleToFit,
		textAnchor,
		verticalAnchor,
		ref,
		...props
	} = resolveDefaultProps(outsideProps, textDefaultProps);
	const wordsByLines = useMemo(() => {
		return getWordsByLines({
			breakAll: props.breakAll,
			children: props.children,
			maxLines: props.maxLines,
			scaleToFit,
			style: props.style,
			width: props.width,
		});
	}, [props.breakAll, props.children, props.maxLines, scaleToFit, props.style, props.width]);
	const { dx, dy, angle, className, breakAll, ...textProps } = props;
	if (!isNumOrStr(propsX) || !isNumOrStr(propsY) || wordsByLines.length === 0) {
		return null;
	}
	const x = Number(propsX) + (isNumber(dx) ? dx : 0);
	const y = Number(propsY) + (isNumber(dy) ? dy : 0);
	if (!isWellBehavedNumber(x) || !isWellBehavedNumber(y)) {
		return null;
	}
	let startDy;
	switch (verticalAnchor) {
		case 'start':
			startDy = reduceCSSCalc('calc(' + capHeight + ')');
			break;
		case 'middle':
			startDy = reduceCSSCalc(
				'calc(' + (wordsByLines.length - 1) / 2 + ' * -' + lineHeight + ' + (' + capHeight +
					' / 2))',
			);
			break;
		default:
			startDy = reduceCSSCalc('calc(' + (wordsByLines.length - 1) + ' * -' + lineHeight + ')');
			break;
	}
	const transforms = [];
	const firstLine = wordsByLines[0];
	if (scaleToFit && firstLine != null) {
		const lineWidth = firstLine.width;
		const { width } = props;
		transforms.push(
			'scale(' + (isNumber(width) && isNumber(lineWidth) ? width / lineWidth : 1) + ')',
		);
	}
	if (angle) {
		transforms.push('rotate(' + angle + ', ' + x + ', ' + y + ')');
	}
	if (transforms.length) {
		textProps.transform = transforms.join(' ');
	}
	<text
		{...svgPropertiesAndEvents(textProps)}
		ref={ref}
		x={x}
		y={y}
		class={clsx('recharts-text', className)}
		textAnchor={textAnchor}
		fill={fill.includes('url') ? DEFAULT_FILL : fill}
	>{wordsByLines.map((line, index) => {
		const words = line.words.join(breakAll ? '' : ' ');
		// duplicate words would cause duplicate keys — the index disambiguates
		return <tspan
			x={x}
			dy={index === 0 ? startDy : lineHeight}
			key={words + '-' + index}
		>{words}</tspan>;
	})}</text>
}

Text.displayName = 'Text';
