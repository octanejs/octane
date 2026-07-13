import { DynamicIcon } from '@octanejs/lucide/dynamic';

function Loading() @{
	<span data-loading="true">Loading</span>
}

export function DynamicGallery() @{
	<div>
		<DynamicIcon name="camera" fallback={Loading} />
	</div>
}
