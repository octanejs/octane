import { ViewTransition } from 'octane';

const Glyph = () => <i id="glyph">x</i>;

export const ComponentChild = () => (
	<span>
		<ViewTransition default="none">
			<Glyph />
		</ViewTransition>
	</span>
);

export const HostChild = () => (
	<span>
		<ViewTransition default="none">
			<i id="glyph">x</i>
		</ViewTransition>
	</span>
);

export const TextChild = () => (
	<span>
		<ViewTransition default="none">text</ViewTransition>
	</span>
);
