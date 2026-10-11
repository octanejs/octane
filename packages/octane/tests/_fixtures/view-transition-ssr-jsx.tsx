/** @jsxImportSource octane */
import { Suspense, ViewTransition } from 'octane';

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

export const ArrayChild = () => (
	<span>
		<ViewTransition default="none">
			{[
				<i id="glyph" key="a">
					x
				</i>,
				<b key="b">y</b>,
			]}
		</ViewTransition>
	</span>
);

export const EmptyChild = () => (
	<span>
		<ViewTransition default="none">{null}</ViewTransition>
	</span>
);

export const SuspenseChild = () => (
	<span>
		<ViewTransition default="none">
			<Suspense fallback={null}>
				<Glyph />
			</Suspense>
		</ViewTransition>
	</span>
);
