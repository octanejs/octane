import { ScreenVideoTexture, VideoTexture, WebcamVideoTexture } from '@octanejs/drei';

export function VideoTextureScene(props) @{
	@try {
		<VideoTexture
			ref={props.ref}
			src={props.src}
			unsuspend={props.unsuspend}
			start={props.start}
			crossOrigin={props.crossOrigin}
			muted={props.muted}
			loop={props.loop}
			playsInline={props.playsInline}
			onVideoFrame={props.onVideoFrame}
			children={props.children}
		/>
	} @pending {
		null;
	}
}

export function ScreenVideoTextureScene(props) @{
	@try {
		<ScreenVideoTexture ref={props.ref} options={props.options} start={false} children={props.children} />
	} @pending {
		null;
	}
}

export function WebcamVideoTextureScene(props) @{
	@try {
		<WebcamVideoTexture ref={props.ref} constraints={props.constraints} start={false} children={props.children} />
	} @pending {
		null;
	}
}
