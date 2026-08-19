// Home: the page is just the running order of its sections (./sections). It owns
// nothing but the page frame — each section keeps its own markup, copy and
// scoped styles.
import { Hero } from './sections/Hero.tsrx';
import { Features } from './sections/Features.tsrx';
import { Proven } from './sections/Proven.tsrx';
import { Why } from './sections/Why.tsrx';
import { ReactCompat } from './sections/ReactCompat.tsrx';
import { Lynx } from './sections/Lynx.tsrx';
import { Spin } from './sections/Spin.tsrx';
import { Explorer } from './sections/Explorer.tsrx';
import { Sponsor } from './sections/Sponsor.tsrx';

export function Home() @{
	<div class="home">
		<Hero />
		<Features />
		<Proven />
		<Why />
		<ReactCompat />
		<Lynx />
		<Spin />
		<Explorer />
		<Sponsor />
		<style>
			.home {
				max-width: 1420px;
				margin: 0 auto;
				padding: 0 1.5rem;
			}
		</style>
	</div>
}
