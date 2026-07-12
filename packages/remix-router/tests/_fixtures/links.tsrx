import { Link } from '@octanejs/remix-router';

// <Link> conformance fixtures — href resolution and click interception (per
// dom/link-href-test.tsx and dom/link-click-test.tsx).

export function LinksPage() @{
	<div>
		<Link id="rel" to="child">{'child'}</Link>
		<Link id="up" to="../sibling">{'up'}</Link>
		<Link id="qs" to="/about?x=1#top">{'qs'}</Link>
	</div>
}

export function BasenameLinkPage() @{
	<Link id="base" to="/about">{'about'}</Link>
}

export function ClickLinksPage() @{
	<div>
		<Link id="spa" to="/about">{'about'}</Link>
		<Link id="reload" to="/about" reloadDocument>{'reload'}</Link>
		<Link id="meta" to="/about">{'meta'}</Link>
	</div>
}
