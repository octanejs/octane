// React's hoist EXCLUSIONS: metadata carrying itemProp (microdata belongs to
// its itemScope host) and anything inside <noscript> (fallback-only content)
// stay in their authored positions — hoisting them would break microdata
// ownership or activate resources meant only for no-JS clients.
export function Microdata() @{
	<section id="md" itemScope itemType="https://schema.org/Person">
		<meta itemProp="name" content="Ada" />
		<link itemProp="url" href="https://ada.example/" />
		<span class="md-name">{'Ada' as string}</span>
	</section>
}

export function NoscriptMeta() @{
	<div id="ns-host">
		<noscript>
			<meta name="ns-desc" content="fallback" />
			<link rel="stylesheet" href="/ns.css" precedence="default" />
		</noscript>
		<p class="ns-p">{'ns' as string}</p>
	</div>
}

// Float RESOURCE forms carrying itemProp: microdata wins — no resource, no hoist.
export function MicrodataResources() @{
	<section id="mdr" itemScope itemType="https://schema.org/Thing">
		<link itemProp="sheet" rel="stylesheet" href="/mdr.css" precedence="default" />
		<script itemProp="loader" async src="/mdr.js" />
		<span class="mdr-body">{'mdr' as string}</span>
	</section>
}
