export function TrailingSpaceBeforeElement() @{
	// prettier-ignore
	<view>Before <item>middle</item> after</view>
}

export function MultilineText() @{
	// prettier-ignore
	<view>
		First line
		second line <item>inline</item>
		last line
	</view>
}

export function TabsInText() @{
	// prettier-ignore
	<view>Tab	separated	<item>x</item>	end</view>
}
