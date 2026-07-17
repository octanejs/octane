/** Hoists a <title> from island content — the §9.2 rejection case. */
export function SsrHeadHoister() @{
	<div class="ssr-head">
		<title>{'island title'}</title>
		{'head hoister'}
	</div>
}
