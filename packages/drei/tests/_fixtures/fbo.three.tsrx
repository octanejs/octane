import { Fbo, useFBO } from '@octanejs/drei';

export function UseFBOScene(props) @{
	const target = useFBO(props.width, props.height, props.settings);
	props.onTarget(target);
	null;
}

export function FboScene(props) @{
	<Fbo
		ref={props.targetRef}
		width={props.width}
		height={props.height}
		{...props.settings}
		children={(target) => {
			props.onChildTarget(target);
			return null;
		}}
	/>
}

export function FboBlockScene() @{
	<Fbo>
		<group name="fbo-block-child" />
	</Fbo>
}
