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
