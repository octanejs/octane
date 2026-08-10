import { GizmoHelper, GizmoViewcube, GizmoViewport, useGizmoContext } from '@octanejs/drei';

function GizmoReader(props) @{
	const api = useGizmoContext();
	props.onApi(api);
	<group ref={props.childRef} name="gizmo-child" />
}

export function GizmoWidgetsScene(props) @{
	<GizmoHelper>
		<group ref={props.childRef}>
			<GizmoViewcube faces={props.faces} />
			<GizmoViewport axisColors={props.axisColors} labels={props.labels} />
		</group>
	</GizmoHelper>
}

export function GizmoHelperScene(props) @{
	<GizmoHelper alignment={props.alignment} margin={props.margin} renderPriority={props.renderPriority} onUpdate={props.onUpdate}>
		<GizmoReader onApi={props.onApi} childRef={props.childRef} />
	</GizmoHelper>
}
