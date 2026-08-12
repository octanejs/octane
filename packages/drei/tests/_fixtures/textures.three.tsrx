/** @jsxImportSource @octanejs/three/intrinsics */
import { CubeTexture, Ktx2, Texture } from '@octanejs/drei';

function LoadedTexture(props) @{
	<Texture input={props.input} onLoad={props.onLoad} children={props.children} />
}

export function TextureBoundary(props) @{
	@try {
		<LoadedTexture {...props} />
	} @pending {
		<group name="loading" />
	}
}

function LoadedTextureBlock(props) @{
	<Texture input={props.input}>
		<group name="texture-block-child" />
	</Texture>
}

export function TextureBlockBoundary(props) @{
	@try {
		<LoadedTextureBlock {...props} />
	} @pending {
		<group name="loading" />
	}
}

function LoadedCubeTexture(props) @{
	<CubeTexture files={props.files} path={props.path} children={props.children} />
}

export function CubeTextureBoundary(props) @{
	@try {
		<LoadedCubeTexture {...props} />
	} @pending {
		<group name="loading" />
	}
}

function LoadedKtx2(props) @{
	<Ktx2 input={props.input} basisPath={props.basisPath} children={props.children} />
}

export function Ktx2Boundary(props) @{
	@try {
		<LoadedKtx2 {...props} />
	} @pending {
		<group name="loading" />
	}
}
