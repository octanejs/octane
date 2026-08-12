import { DetectGPU } from '@octanejs/drei';

export function DetectGPUScene(props) @{
	@try {
		<DetectGPU {...props.options}>
			{props.onResult}
		</DetectGPU>
	} @pending {
		null;
	}
}
