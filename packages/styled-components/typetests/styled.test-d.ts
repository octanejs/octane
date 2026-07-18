// Type-level contract for the octane styled-components surface: tagged
// template generics, interpolation execution contexts, attrs optionality,
// wrapped-component prop inference, and the pragmatic polymorphic call site.
import styled, {
	css,
	keyframes,
	createGlobalStyle,
	ThemeProvider,
	useTheme,
	withTheme,
	isStyledComponent,
	ServerStyleSheet,
	StyleSheetManager,
	type DefaultTheme,
	type ExecutionContext,
	type Keyframes,
	type RuleSet,
} from '@octanejs/styled-components';

declare function expectType<T>(value: T): void;

// --- tagged template generics: transient props are typed in interpolations ---
const Button = styled.button<{ $variant?: 'primary' | 'ghost'; $depth: number }>`
	color: ${(props) => {
		expectType<'primary' | 'ghost' | undefined>(props.$variant);
		expectType<number>(props.$depth);
		expectType<DefaultTheme>(props.theme);
		return props.$variant === 'primary' ? 'white' : 'black';
	}};
	z-index: ${(props) => props.$depth};
`;

// declared props are enforced at the call site…
Button({ $depth: 1, $variant: 'primary' });
// @ts-expect-error — $variant must be one of the declared literals
Button({ $depth: 1, $variant: 'loud' });
// …while the permissive bag admits arbitrary DOM props and ref/as
Button({ $depth: 2, id: 'b', onClick: () => {}, ref: (el: Element | null) => {}, as: 'a' });

// --- css / keyframes primitives ---
const rule: RuleSet<{ $on?: boolean }> = css<{ $on?: boolean }>`
	opacity: ${(p) => (p.$on ? 1 : 0)};
`;
const spin: Keyframes = keyframes`
  to { transform: rotate(360deg); }
`;
expectType<string>(spin.name);

// --- the canonical attrs idiom: DOM props allowed, transient props typed ---
const Field = styled.input.attrs({ type: 'text' })<{ $tone: string }>`
	border-color: ${(p) => {
		expectType<string>(p.$tone);
		return p.$tone;
	}};
`;
Field({ $tone: 'calm' });
Field({ $tone: 'calm', placeholder: 'free-form DOM props are admitted' });
const FnAttrs = styled.button.attrs<{ $kind?: 'a' | 'b' }>((props) => ({
	'data-kind': props.$kind ?? 'a',
}))`
	color: black;
`;
FnAttrs({});
FnAttrs({ $kind: 'b' });

// --- wrapping a component infers its props from the function signature ---
function Card(props: { title: string; className?: string }) {
	return null;
}
const StyledCard = styled(Card)`
	padding: 1rem;
`;
StyledCard({ title: 'ok' });
// @ts-expect-error — title is required by the wrapped component
StyledCard({});

// --- folding keeps the styled statics ---
expectType<string>(StyledCard.styledComponentId);
expectType<string>(String(Button));

// --- theming surface ---
const theme: DefaultTheme = { accent: 'rebeccapurple' };
ThemeProvider({ theme, children: null });
ThemeProvider({ theme: (outer?: DefaultTheme) => ({ ...outer }), children: null });
declare function inComponent(): void;
function ThemedProbe() {
	expectType<DefaultTheme>(useTheme());
	return null;
}
withTheme(ThemedProbe);

// --- global styles receive the execution context ---
const Global = createGlobalStyle<{ $bg: string }>`
  body { background: ${(p: ExecutionContext & { $bg: string }) => p.$bg}; }
`;

// --- SSR + manager surfaces keep their shapes ---
const sheet = new ServerStyleSheet();
expectType<string>(sheet.getStyleTags());
StyleSheetManager({ namespace: '#app', disableCSSOMInjection: true, children: null });

// --- guards ---
if (isStyledComponent(Button)) {
	expectType<{ readonly _sc: symbol }>(Button);
}
