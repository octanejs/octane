interface AriaAttributeProps {
	attributes: Record<string, unknown>;
}

export function SpreadAriaAttributes(props: AriaAttributeProps) @{
	<div id="aria-spread" {...props.attributes} />
}

export function CustomAriaAttributes(props: AriaAttributeProps) @{
	<custom-aria-element id="aria-custom" {...props.attributes} />
}

export function SvgAriaAttributes(props: AriaAttributeProps) @{
	<svg id="aria-svg" {...props.attributes} />
}

export function DynamicUnknownAria(props: { value: string }) @{
	<div id="aria-dynamic" aria-dynamicinvalid={props.value} />
}

export function StaticUnknownAria() @{
	<div id="aria-static" aria-staticinvalid="invalid" />
}

export function StaticCamelCaseAria() @{
	<div id="aria-static-camel" ariaLabel="label" />
}

export function StaticMiscasedAria() @{
	<div id="aria-static-miscased" aria-hasPopUp="true" />
}

export function StaticBareAria() @{
	<div id="aria-static-bare" aria="reserved" />
}

export function ValidAriaAttributes(props: { hidden: boolean }) @{
	<div
		id="aria-valid"
		aria-label="accessible label"
		aria-description="accessible description"
		aria-hidden={props.hidden}
		aria-haspopup="menu"
		aria-braillelabel="braille label"
		aria-brailleroledescription="navigation"
		aria-colindextext="column one"
		aria-rowindextext="row one"
	/>
}
