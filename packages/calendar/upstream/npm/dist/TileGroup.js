import { jsx as _jsx } from "react/jsx-runtime";
import Flex from './Flex.js';
import { getTileClasses } from './shared/utils.js';
export default function TileGroup({ className, count = 3, dateTransform, dateType, end, hover, offset, renderTile, start, step = 1, value, valueType, }) {
    const tiles = [];
    for (let point = start; point <= end; point += step) {
        const date = dateTransform(point);
        tiles.push(renderTile({
            classes: getTileClasses({
                date,
                dateType,
                hover,
                value,
                valueType,
            }),
            date,
        }));
    }
    return (_jsx(Flex, { className: className, count: count, offset: offset, wrap: true, children: tiles }));
}
