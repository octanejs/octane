import {
	ArcballControls,
	DeviceOrientationControls,
	FirstPersonControls,
	FlyControls,
	MapControls,
	OrbitControls,
	TrackballControls,
} from '@octanejs/drei';

export function OrbitScene(props) @{
	<OrbitControls ref={props.controlRef} makeDefault regress onChange={props.onChange} />
}

export function MapScene(props) @{
	<MapControls ref={props.controlRef} makeDefault onChange={props.onChange} />
}

export function TrackballScene(props) @{
	<TrackballControls ref={props.controlRef} makeDefault regress onChange={props.onChange} />
}

export function ArcballScene(props) @{
	<ArcballControls ref={props.controlRef} makeDefault regress onChange={props.onChange} />
}

export function FlyScene(props) @{
	<FlyControls ref={props.controlRef} makeDefault onChange={props.onChange} />
}

export function FirstPersonScene(props) @{
	<FirstPersonControls ref={props.controlRef} makeDefault movementSpeed={3} />
}

export function DeviceOrientationScene(props) @{
	<DeviceOrientationControls ref={props.controlRef} makeDefault onChange={props.onChange} />
}
