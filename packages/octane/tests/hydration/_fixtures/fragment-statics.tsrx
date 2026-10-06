// Server and client builds that disagree only in a fragment's static markup:
// once as the root component's fragment, once as a fragment nested in a host.
// Adoption matches each root by its tag, so the server's markup is kept.

export function ServerRootFragment() @{
	<>
		<h1 class="title">{'Heading'}</h1>
		<section class="box">
			<span class="s1">one</span>
		</section>
	</>
}

export function ClientRootFragment() @{
	<>
		<h1 class="title">{'Heading'}</h1>
		<section class="box">
			<p class="p1">two</p>
		</section>
	</>
}

function ServerPair() @{
	<>
		<b class="server">{'bold'}</b>
		<i>{'italic'}</i>
	</>
}

function ClientPair() @{
	<>
		<b class="client">{'bold'}</b>
		<i>{'italic'}</i>
	</>
}

export function ServerNestedFragment() @{
	<div id="nested">
		<ServerPair />
	</div>
}

export function ClientNestedFragment() @{
	<div id="nested">
		<ClientPair />
	</div>
}
