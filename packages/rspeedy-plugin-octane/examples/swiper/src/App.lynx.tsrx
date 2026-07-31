/** @jsxImportSource @octanejs/lynx/intrinsics */
import { Page } from './Page.lynx.tsrx';
import { picsArr } from './pics.ts';
import { Swiper } from './Swiper.lynx.tsrx';

const easing = (x: number) => {
	'main thread';
	return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};

export function App() @{
	<Page>
		<Swiper data={picsArr} easing={easing} />
	</Page>
}
