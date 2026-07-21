import { CARDS } from './deopt-data';
import type { CardData } from './deopt-data';

// FAST-PATH authoring of the deopt page: compiled .tsrx, so the server build
// emits mostly-static HTML string concatenation (compile.js ssrEmitElement) —
// static attrs baked at compile time, `{...c.meta}` through ssrSpread, dynamic
// class/style through ssrAttr/ssrStyle, text holes through ssrText.
//
// deopt-plain.ts is the SAME page authored as plain-.ts createElement
// descriptors (the shape every @octanejs binding produces), which SSR
// serializes through the interpretive ssrChild / ssrHostElement /
// ssrDeoptBlockChildren path. The harness gate strips hydration comment
// markers from both bodies and requires byte equality; the headline number is
// the plain/compiled render-time ratio (the intra-octane authoring cliff).

export function Avatar(props: { initials: string; hue: number }) @{
	<span
		class="avatar"
		style={{ background: 'hsl(' + props.hue + ',60%,50%)' }}
	>{props.initials as string}</span>
}

export function Card(props: { c: CardData }) @{
	const c = props.c;
	<article
		class={['card', c.theme, { featured: c.featured }]}
		data-id={c.id}
		{...c.meta}
		style={{ width: c.width + 'px' }}
	>
		<Avatar initials={c.initials} hue={c.hue} />
		<h3 class="name">{c.name as string}</h3>
		<p class="role">{c.role as string}</p>
		<ul class="tags">
			@for (const t of c.tags; key t) {
				<li class="tag">{t as string}</li>
			}
		</ul>
	</article>
}

export function DeoptPageFast() @{
	<main class="grid">
		<h1 class="head">{'Deopt page - ' + CARDS.length + ' cards'}</h1>
		@for (const c of CARDS; key c.id) {
			<Card c={c} />
		}
	</main>
}
