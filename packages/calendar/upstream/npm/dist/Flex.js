import { jsx as _jsx } from "react/jsx-runtime";
import { Children, cloneElement } from 'react';
function toPercent(num) {
    return `${num}%`;
}
export default function Flex({ children, className, count, direction, offset, style, wrap, ...otherProps }) {
    return (_jsx("div", { className: className, style: {
            display: 'flex',
            flexDirection: direction,
            flexWrap: wrap ? 'wrap' : 'nowrap',
            ...style,
        }, ...otherProps, children: Children.map(children, (child, index) => {
            const marginInlineStart = offset && index === 0 ? toPercent((100 * offset) / count) : null;
            return cloneElement(child, {
                ...child.props,
                style: {
                    flexBasis: toPercent(100 / count),
                    flexShrink: 0,
                    flexGrow: 0,
                    overflow: 'hidden',
                    marginLeft: marginInlineStart,
                    marginInlineStart: marginInlineStart,
                    marginInlineEnd: 0,
                },
            });
        }) }));
}
