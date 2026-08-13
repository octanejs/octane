interface AttributeProps {
	attributes: Record<string, unknown>;
}

export function SpreadUnknownProperties(props: AttributeProps) @{
	<div id="unknown-properties" {...props.attributes} />
}

export function CustomUnknownProperties(props: AttributeProps) @{
	<unknown-property-element id="custom-unknown-properties" {...props.attributes} />
}

export function SvgUnknownProperties(props: AttributeProps) @{
	<svg id="svg-unknown-properties" {...props.attributes} />
}

export function DynamicBooleanProperty(props: { value: unknown }) @{
	<div id="dynamic-boolean-property" hidden={props.value} />
}

export function DynamicInertBooleanProperty(props: { value: unknown }) @{
	<div id="dynamic-inert-boolean-property" inert={props.value} />
}

export function StaticFalseBooleanProperty() @{
	<button id="static-false-boolean-property" required="false" />
}

export function StaticTrueBooleanProperty() @{
	<button id="static-true-boolean-property" disabled="true" />
}

export function StaticUnknownCamelProperty() @{
	<div id="static-unknown-camel-property" mysteryStaticProperty="visible" />
}

export function StaticReservedInnerHtml() @{
	<div id="static-reserved-inner-html" InnerHTML="<strong>not parsed</strong>" />
}

export function DynamicImageSource(props: { value: unknown }) @{
	<img id="dynamic-image-source" src={props.value} />
}

export function StaticEmptyObjectData() @{
	<object id="static-empty-object-data" data="" />
}

export function DynamicAnchorHref(props: { value: unknown }) @{
	<a id="dynamic-anchor-href" href={props.value}>{'valid empty href'}</a>
}

export function DynamicObjectData(props: { value: unknown }) @{
	<object id="dynamic-object-data" data={props.value} />
}
