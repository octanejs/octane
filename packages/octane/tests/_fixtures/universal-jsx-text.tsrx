export function TrailingSpaceBeforeElement() @{
	// prettier-ignore
	<p>Before <span>middle</span> after</p>
}

export function MultilineText() @{
	// prettier-ignore
	<p>
		First line
		second line <span>inline</span>
		last line
	</p>
}

export function TabsInText() @{
	// prettier-ignore
	<p>Tab	separated	<span>x</span>	end</p>
}

export function SpaceBetweenInlineSiblings() @{
	// prettier-ignore
	<p><span>a</span> <span>b</span>  <span>c</span></p>
}

export function NewlineSeparatedSiblings() @{
	// prettier-ignore
	<p>
		<span>a</span>
		<span>b</span> <span>c</span>
	</p>
}

export function MixedTextAndExpressions() @{
	const first = 'x';
	const second = 'y';
	// prettier-ignore
	<p>{first} <span>and</span> {second}! <span>{first}</span>{' '}{second}</p>
}

export function EdgeWhitespaceInsideElements() @{
	// prettier-ignore
	<p> <span> inner </span> <span>
		next
	</span> </p>
}

export function SpaceBetweenFragmentSiblings() @{
	// prettier-ignore
	<><span>a</span> <span>b</span></>
}

function Wrap({ children }: { children?: any }) @{
	<p>{children}</p>
}

export function SpaceAroundComponentChildren() @{
	const value = 'v';
	// prettier-ignore
	<div><Wrap> {value}</Wrap><Wrap><span>a</span> <span>b</span></Wrap><Wrap>{value} </Wrap></div>
}
