import { use } from 'octane';
import {
	cardData,
	delayFor,
	CARD_COUNT,
	type CardData,
	type Scenario,
} from '../../../streaming-ssr/octane/src/data';

// The streaming-ssr page re-authored for the RenderRoute shape: per-request
// data creation happens AT the use() site, the canonical octane pattern — the
// compiler memoizes the creation across streaming re-passes (puMemo), so each
// card's timer starts once per request. Creating the promises in an ANCESTOR
// and passing them down as data is NOT cross-pass stable (see data.ts's
// warning on makeCards): every re-pass would restart the timers and the wave
// loop livelocks into SSR error #37. The markup below mirrors
// ../../streaming-ssr/octane/src/App.tsrx element-for-element so the
// octane-app vs octane-tsrx delta stays the metaframework layer, not the page.
function loadCard(scenario: Scenario, i: number): Promise<CardData> {
	return new Promise((resolve) => setTimeout(() => resolve(cardData(i)), delayFor(scenario, i)));
}

const INDICES: number[] = [];
for (let i = 0; i < CARD_COUNT; i++) INDICES.push(i);

function CardBody(props: { scenario: Scenario; index: number }) @{
	const data = use(loadCard(props.scenario, props.index));
	<article class="card">
		<h3 class="title">
			{data.title as string}
		</h3>
		<p class="sub">
			{data.subtitle as string}
		</p>
		<ul class="specs">
			@for (const it of data.items; key it.label) {
				<li class="spec">
					<span class="label">
						{it.label as string}
					</span>
					<span class="value">
						{it.value as string}
					</span>
				</li>
			}
		</ul>
		<div class="meta">
			<span class="tag">
				{data.tag as string}
			</span>
			<span class="note">
				{data.note as string}
			</span>
		</div>
	</article>
}

function Card(props: { scenario: Scenario; index: number }) @{
	<section class="slot">
		@try {
			<CardBody scenario={props.scenario} index={props.index} />
		} @pending {
			<div class="skeleton">
				<div class="bar"></div>
				<div class="bar"></div>
				<div class="bar"></div>
			</div>
		}
	</section>
}

export function StreamPage(props: { scenario: Scenario }) @{
	<div class="site">
		<header class="masthead">
			<h1 class="brand">
				{'Octane Outfitters' as string}
			</h1>
			<p class="tagline">
				{'streaming SSR benchmark storefront' as string}
			</p>
			<nav class="nav">
				<ul class="links">
					@for (const n of [
						'home',
						'new',
						'sale',
						'gear',
						'parts',
						'labs',
						'blog',
						'help',
					]; key n) {
						<li class="link">
							<a href={'/' + n}>
								{n as string}
							</a>
						</li>
					}
				</ul>
			</nav>
		</header>
		<section class="hero">
			<h2 class="pitch">
				{'Ten cards, one stream' as string}
			</h2>
			<p class="blurb">
				{'The shell flushes immediately; each card streams when its data resolves.' as string}
			</p>
			<div class="stats">
				<div class="stat">
					<span class="num">
						{'10' as string}
					</span>
					<span class="cap">
						{'boundaries' as string}
					</span>
				</div>
				<div class="stat">
					<span class="num">
						{'50' as string}
					</span>
					<span class="cap">
						{'shell elements' as string}
					</span>
				</div>
				<div class="stat">
					<span class="num">
						{'20' as string}
					</span>
					<span class="cap">
						{'elements per card' as string}
					</span>
				</div>
			</div>
		</section>
		<main class="grid">
			@for (const i of INDICES; key i) {
				<Card scenario={props.scenario} index={i} />
			}
		</main>
		<footer class="foot">
			<p class="fine">
				{'Octane Outfitters — streaming SSR benchmark' as string}
			</p>
			<small class="legal">
				{'same DOM shape and data schedule across all frameworks' as string}
			</small>
		</footer>
	</div>
}
