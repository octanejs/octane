import React, { Component } from 'react';
import { Animated } from 'react-native';
import { IContentLoaderProps } from './';
declare class NativeSvg extends Component<IContentLoaderProps> {
    static defaultProps: {
        animate: boolean;
        backgroundColor: string;
        backgroundOpacity: number;
        foregroundColor: string;
        foregroundOpacity: number;
        rtl: boolean;
        speed: number;
        interval: number;
        style: {};
        beforeMask: any;
    };
    animatedValue: Animated.Value;
    fixedId: string;
    idClip: string;
    idGradient: string;
    unmounted: boolean;
    setAnimation: () => void;
    componentDidMount: () => void;
    componentDidUpdate(prevProps: IContentLoaderProps): void;
    componentWillUnmount(): void;
    render(): React.JSX.Element;
}
export default NativeSvg;
//# sourceMappingURL=Svg.d.ts.map