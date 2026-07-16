import { useLayoutEffect } from '@octanejs/three/renderer';
import { useLoader } from '@octanejs/three';

function LoadedModel(props) @{
	const model = useLoader(props.loader, props.input, props.extensions, props.onProgress);
	useLayoutEffect(() => props.onLoad(model), [model, props.onLoad]);
	<primitive object={model.scene} />
}

export function ModelLoaderBoundary(props) @{
	@try {
		<LoadedModel
			loader={props.loader}
			input={props.input}
			extensions={props.extensions}
			onProgress={props.onProgress}
			onLoad={props.onLoad}
		/>
	} @pending {
		<group name="loading" />
	} @catch (error) {
		<group name={'error:' + error.message} />
	}
}

function LoadedArray(props) @{
	const assets = useLoader(props.loader, props.input, props.extensions, props.onProgress);
	useLayoutEffect(() => props.onLoad(assets), [assets, props.onLoad]);
	<group name="loaded-array" />
}

export function ArrayLoaderBoundary(props) @{
	@try {
		<LoadedArray
			loader={props.loader}
			input={props.input}
			extensions={props.extensions}
			onProgress={props.onProgress}
			onLoad={props.onLoad}
		/>
	} @pending {
		<group name="loading" />
	} @catch (error) {
		<group name={'error:' + error.message} />
	}
}
