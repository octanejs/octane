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

export function SpaceBetweenInlineSiblings() @{
	// prettier-ignore
	<view><item>a</item> <item>b</item>  <item>c</item></view>
}

export function NewlineSeparatedSiblings() @{
	// prettier-ignore
	<view>
		<item>a</item>
		<item>b</item> <item>c</item>
	</view>
}

export function MixedTextAndExpressions() @{
	const first = 'x';
	const second = 'y';
	// prettier-ignore
	<view>{first} <item>and</item> {second}! <item>{first}</item>{' '}{second}</view>
}

export function EdgeWhitespaceInsideElements() @{
	// prettier-ignore
	<view> <item> inner </item> <item>
		next
	</item> </view>
}

export function SpaceBetweenFragmentSiblings() @{
	// prettier-ignore
	<><item>a</item> <item>b</item></>
}

function Wrap({ children }: { children?: any }) @{
	<view>{children}</view>
}

export function SpaceAroundComponentChildren() @{
	const value = 'v';
	// prettier-ignore
	<group><Wrap> {value}</Wrap><Wrap><item>a</item> <item>b</item></Wrap><Wrap>{value} </Wrap></group>
}
