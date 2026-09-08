import { OctaneNode } from 'octane';

export const FigureWithCaption = (props: {
	caption: string;
	children: OctaneNode;
}) => <figure>
	{props.children}
	<figcaption>{props.caption}</figcaption>
</figure>;
