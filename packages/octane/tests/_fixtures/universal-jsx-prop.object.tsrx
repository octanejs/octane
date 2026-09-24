export function UniversalPropCard(props) @{
	<label>{props.title as string}</label>
}

export function UniversalPropHost(props) @{
	<frame>{props.card}</frame>
}

export function UniversalPropScene(props) @{
	<UniversalPropHost card={<UniversalPropCard title={props.title} />} />
}
