import { useState } from 'octane';
import { Head, Link, Meta, Seo, Title } from '@octanejs/seo';

function Home() @{
	<>
		<Seo title="Home" description="home description" canonical="/" site="https://x.dev" />
		<main>home</main>
	</>
}

function Article() @{
	<>
		<Seo
			title="Article"
			canonical="/article"
			site="https://x.dev"
			openGraph={{ type: 'article', images: ['/og.png'] }}
		/>
		<main>article</main>
	</>
}

/** A page whose metadata set SHRINKS on interaction, to prove stale keys go. */
function Toggling() @{
	const [extra, setExtra] = useState(true);
	<>
		<Title text="Toggling" />
		@if (extra) {
			<Meta name="robots" content="noindex" />
		}
		<main>
			<button id="drop" onClick={() => setExtra(false)}>drop</button>
		</main>
	</>
}

/** A page whose meta NAME changes, so the descriptor key itself moves. */
function Renaming() @{
	const [name, setName] = useState('first');
	<>
		<Title text="Renaming" />
		<Meta name={name} content="value" />
		<main>
			<button id="rename" onClick={() => setName('second')}>rename</button>
		</main>
	</>
}

export function NavApp() @{
	const [route, setRoute] = useState('home');
	<Head>
		<Title text="Site default" />
		<Link rel="icon" href="/favicon.ico" />
		<nav>
			<button id="to-home" onClick={() => setRoute('home')}>home</button>
			<button id="to-article" onClick={() => setRoute('article')}>article</button>
			<button id="to-toggling" onClick={() => setRoute('toggling')}>toggling</button>
			<button id="to-renaming" onClick={() => setRoute('renaming')}>renaming</button>
		</nav>
		@switch (route) {
			@case 'home': {
				<Home />
			}
			@case 'article': {
				<Article />
			}
			@case 'toggling': {
				<Toggling />
			}
			@default: {
				<Renaming />
			}
		}
	</Head>
}
