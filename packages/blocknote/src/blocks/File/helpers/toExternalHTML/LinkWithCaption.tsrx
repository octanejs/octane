import { OctaneNode } from 'octane';

export const LinkWithCaption = (props: {
	caption: string;
	children: OctaneNode;
}) => <div>
	{props.children}
	<p>{props.caption}</p>
</div>;
