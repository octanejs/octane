declare const valueOnlyInputs: {
    readonly reset: true;
    readonly submit: true;
};
export type ValueOnlyInputsKeys = keyof typeof valueOnlyInputs;
export type Attributes = Record<PropertyKey, string>;
export type Props = Record<PropertyKey, string | boolean> & {
    dangerouslySetInnerHTML?: {
        __html: string;
    };
    key?: string | number;
    style?: Record<PropertyKey, string>;
};
/**
 * Converts HTML/SVG DOM attributes to React props.
 *
 * @param attributes - HTML/SVG DOM attributes.
 * @param nodeName - DOM node name.
 * @returns - React props.
 */
export default function attributesToProps(attributes?: Attributes, nodeName?: string): Props;
export {};
//# sourceMappingURL=attributes-to-props.d.ts.map