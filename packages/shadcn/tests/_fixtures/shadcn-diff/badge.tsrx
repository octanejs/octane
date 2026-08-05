import { Badge } from '@octanejs/shadcn/Badge';
import { createElement } from 'octane';

export function BadgeGallery() @{
	<div>
		<Badge id="b-def">New</Badge>
		<Badge variant="secondary">Beta</Badge>
		<Badge variant="destructive">Err</Badge>
		<Badge variant="outline">Out</Badge>
		<Badge variant="ghost">Ghost</Badge>
		<Badge variant="link">Link</Badge>
		<Badge variant="secondary" className="custom-badge px-4">Merged</Badge>
		<Badge
			asChild
			variant="outline"
			children={createElement('a', { id: 'b-link', href: '#profile' }, 'Profile')}
		/>
	</div>
}
