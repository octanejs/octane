type FlexProps = React.HTMLAttributes<HTMLDivElement> & {
    children: React.ReactElement<any>[];
    className?: string;
    count: number;
    direction?: 'row' | 'column';
    offset?: number;
    style?: React.CSSProperties;
    wrap?: boolean;
};
export default function Flex({ children, className, count, direction, offset, style, wrap, ...otherProps }: FlexProps): React.ReactElement;
export {};
