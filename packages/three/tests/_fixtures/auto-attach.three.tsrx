export function AutoAttachArrayScene(props) @{
	<primitive object={props.parent} {...{ __octaneAutoAttachArray: 'passes' }}>
		<primitive object={props.first} />
		<primitive object={props.second} />
	</primitive>
}

export function MixedAutoAttachArrayScene(props) @{
	<primitive object={props.parent} {...{ __octaneAutoAttachArray: 'passes' }}>
		<primitive object={props.explicit} attach="explicit" />
		<primitive object={props.first} />
		<primitive object={props.callback} attach={props.attachCallback} />
		<primitive object={props.second} />
	</primitive>
}
