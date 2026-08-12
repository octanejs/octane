/** @jsxImportSource @octanejs/three/intrinsics */
import { Fbx, Gltf, useFBX, useGLTF } from '@octanejs/drei';

function LoadedGltf(props) @{
	const result = useGLTF(props.src, props.useDraco, props.useMeshOpt, props.extendLoader);
	props.onLoad(result);
	<Gltf
		src={props.src}
		useDraco={props.useDraco}
		useMeshOpt={props.useMeshOpt}
		extendLoader={props.extendLoader}
		ref={props.modelRef}
		name="gltf-clone"
	/>
}

export function GltfBoundary(props) @{
	@try {
		<LoadedGltf {...props} />
	} @pending {
		<group name="loading" />
	}
}

function LoadedFbx(props) @{
	const result = useFBX(props.path);
	props.onLoad(result);
	<Fbx path={props.path} name="fbx-clone" ref={props.modelRef} />
}

export function FbxBoundary(props) @{
	@try {
		<LoadedFbx {...props} />
	} @pending {
		<group name="loading" />
	}
}
