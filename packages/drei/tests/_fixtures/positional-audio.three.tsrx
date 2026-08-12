import { PositionalAudio } from '@octanejs/drei';

export function PositionalAudioScene(props) @{
	@try {
		<PositionalAudio
			ref={props.ref}
			url={props.url}
			distance={props.distance}
			loop={props.loop}
			autoplay={props.autoplay}
			position={props.position}
		/>
	} @pending {
		null;
	}
}
