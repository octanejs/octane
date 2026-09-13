import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import type { ExpectedPublicContracts } from '../../typetests/expected-public-contracts';
import type * as Actual0 from '@octanejs/tanstack-router';
import type * as Actual1 from '@octanejs/tanstack-router/history';
import type * as Actual2 from '@octanejs/tanstack-router/ssr/server';
import type * as Actual3 from '@octanejs/tanstack-router/ssr/client';
import type * as Actual4 from '@octanejs/tanstack-router/generator-plugin';
type Contract_0_reactUse = Assert<Equal<keyof typeof Actual0.reactUse, ExpectedPublicContracts[0]>>;
type Contract_1_useLayoutEffect = Assert<
	Equal<Parameters<typeof Actual0.useLayoutEffect>['length'], ExpectedPublicContracts[1]>
>;
type Contract_2_createHistory = Assert<
	Equal<Parameters<typeof Actual0.createHistory>['length'], ExpectedPublicContracts[2]>
>;
type Contract_3_createBrowserHistory = Assert<
	Equal<Parameters<typeof Actual0.createBrowserHistory>['length'], ExpectedPublicContracts[3]>
>;
type Contract_4_createHashHistory = Assert<
	Equal<Parameters<typeof Actual0.createHashHistory>['length'], ExpectedPublicContracts[4]>
>;
type Contract_5_createMemoryHistory = Assert<
	Equal<Parameters<typeof Actual0.createMemoryHistory>['length'], ExpectedPublicContracts[5]>
>;
type Contract_6_RouterHistory = Assert<
	Equal<keyof Actual0.RouterHistory, ExpectedPublicContracts[6]>
>;
type Contract_7_HistoryLocation = Assert<
	Equal<keyof Actual0.HistoryLocation, ExpectedPublicContracts[7]>
>;
type Contract_8_ParsedPath = Assert<Equal<keyof Actual0.ParsedPath, ExpectedPublicContracts[8]>>;
type Contract_9_HistoryState = Assert<
	Equal<keyof Actual0.HistoryState, ExpectedPublicContracts[9]>
>;
type Contract_10_ParsedHistoryState = Assert<
	Equal<keyof Actual0.ParsedHistoryState, ExpectedPublicContracts[10]>
>;
type Contract_11_HistoryAction = Assert<Equal<Actual0.HistoryAction, ExpectedPublicContracts[11]>>;
type Contract_12_BlockerFnArgs = Assert<
	Equal<keyof Actual0.BlockerFnArgs, ExpectedPublicContracts[12]>
>;
type Contract_13_BlockerFn = Assert<Equal<keyof Actual0.BlockerFn, ExpectedPublicContracts[13]>>;
type Contract_14_NavigationBlocker = Assert<
	Equal<keyof Actual0.NavigationBlocker, ExpectedPublicContracts[14]>
>;
type Contract_15_createRouter = Assert<
	Equal<Parameters<typeof Actual0.createRouter>['length'], ExpectedPublicContracts[15]>
>;
type Contract_16_Router = Assert<
	Equal<ConstructorParameters<typeof Actual0.Router>['length'], ExpectedPublicContracts[16]>
>;
type Contract_17_createRoute = Assert<
	Equal<Parameters<typeof Actual0.createRoute>['length'], ExpectedPublicContracts[17]>
>;
type Contract_18_createRootRoute = Assert<
	Equal<Parameters<typeof Actual0.createRootRoute>['length'], ExpectedPublicContracts[18]>
>;
type Contract_19_createRootRouteWithContext = Assert<
	Equal<
		Parameters<typeof Actual0.createRootRouteWithContext>['length'],
		ExpectedPublicContracts[19]
	>
>;
type Contract_20_rootRouteWithContext = Assert<
	Equal<Parameters<typeof Actual0.rootRouteWithContext>['length'], ExpectedPublicContracts[20]>
>;
type Contract_21_createRouteMask = Assert<
	Equal<Parameters<typeof Actual0.createRouteMask>['length'], ExpectedPublicContracts[21]>
>;
type Contract_22_getRouteApi = Assert<
	Equal<Parameters<typeof Actual0.getRouteApi>['length'], ExpectedPublicContracts[22]>
>;
type Contract_23_Route = Assert<
	Equal<ConstructorParameters<typeof Actual0.Route>['length'], ExpectedPublicContracts[23]>
>;
type Contract_24_RootRoute = Assert<
	Equal<ConstructorParameters<typeof Actual0.RootRoute>['length'], ExpectedPublicContracts[24]>
>;
type Contract_25_RouteApi = Assert<
	Equal<ConstructorParameters<typeof Actual0.RouteApi>['length'], ExpectedPublicContracts[25]>
>;
type Contract_26_NotFoundRoute = Assert<
	Equal<ConstructorParameters<typeof Actual0.NotFoundRoute>['length'], ExpectedPublicContracts[26]>
>;
type Contract_27_FileRoute = Assert<
	Equal<ConstructorParameters<typeof Actual0.FileRoute>['length'], ExpectedPublicContracts[27]>
>;
type Contract_28_createFileRoute = Assert<
	Equal<Parameters<typeof Actual0.createFileRoute>['length'], ExpectedPublicContracts[28]>
>;
type Contract_29_FileRouteLoader = Assert<
	Equal<Parameters<typeof Actual0.FileRouteLoader>['length'], ExpectedPublicContracts[29]>
>;
type Contract_30_LazyRoute = Assert<
	Equal<ConstructorParameters<typeof Actual0.LazyRoute>['length'], ExpectedPublicContracts[30]>
>;
type Contract_31_createLazyRoute = Assert<
	Equal<Parameters<typeof Actual0.createLazyRoute>['length'], ExpectedPublicContracts[31]>
>;
type Contract_32_createLazyFileRoute = Assert<
	Equal<Parameters<typeof Actual0.createLazyFileRoute>['length'], ExpectedPublicContracts[32]>
>;
type Contract_33_DefaultRouteTypes = Assert<
	Equal<keyof Actual0.DefaultRouteTypes<{ value: string }>, ExpectedPublicContracts[33]>
>;
type Contract_34_SyncRouteComponent = Assert<
	Equal<keyof Actual0.SyncRouteComponent<{ value: string }>, ExpectedPublicContracts[34]>
>;
type Contract_35_AsyncRouteComponent = Assert<
	Equal<keyof Actual0.AsyncRouteComponent<{ value: string }>, ExpectedPublicContracts[35]>
>;
type Contract_36_RouteComponent = Assert<
	Equal<keyof Actual0.RouteComponent, ExpectedPublicContracts[36]>
>;
type Contract_37_RouteTypes = Assert<
	Equal<keyof Actual0.RouteTypes<{ value: string }>, ExpectedPublicContracts[37]>
>;
type Contract_38_ErrorRouteComponent = Assert<
	Equal<keyof Actual0.ErrorRouteComponent, ExpectedPublicContracts[38]>
>;
type Contract_39_NotFoundRouteComponent = Assert<
	Equal<keyof Actual0.NotFoundRouteComponent, ExpectedPublicContracts[39]>
>;
type Contract_40_AnyRootRoute = Assert<
	Equal<keyof Actual0.AnyRootRoute, ExpectedPublicContracts[40]>
>;
type Contract_41_routerContext = Assert<
	Equal<Parameters<typeof Actual0.routerContext>['length'], ExpectedPublicContracts[41]>
>;
type Contract_42_getRouterContext = Assert<
	Equal<Parameters<typeof Actual0.getRouterContext>['length'], ExpectedPublicContracts[42]>
>;
type Contract_43_matchContext = Assert<
	Equal<Parameters<typeof Actual0.matchContext>['length'], ExpectedPublicContracts[43]>
>;
type Contract_44_useRouter = Assert<
	Equal<Parameters<typeof Actual0.useRouter>['length'], ExpectedPublicContracts[44]>
>;
type Contract_45_useStore = Assert<
	Equal<Parameters<typeof Actual0.useStore>['length'], ExpectedPublicContracts[45]>
>;
type Contract_46_useRouterState = Assert<
	Equal<Parameters<typeof Actual0.useRouterState>['length'], ExpectedPublicContracts[46]>
>;
type Contract_47_UseRouterStateOptions = Assert<
	Equal<
		keyof Actual0.UseRouterStateOptions<
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[47]
	>
>;
type Contract_48_UseRouterStateResult = Assert<
	Equal<
		keyof Actual0.UseRouterStateResult<
			import('@tanstack/router-core').AnyRouter,
			{ value: string }
		>,
		ExpectedPublicContracts[48]
	>
>;
type Contract_49_useMatch = Assert<
	Equal<Parameters<typeof Actual0.useMatch>['length'], ExpectedPublicContracts[49]>
>;
type Contract_50_useLocation = Assert<
	Equal<Parameters<typeof Actual0.useLocation>['length'], ExpectedPublicContracts[50]>
>;
type Contract_51_useParams = Assert<
	Equal<Parameters<typeof Actual0.useParams>['length'], ExpectedPublicContracts[51]>
>;
type Contract_52_useSearch = Assert<
	Equal<Parameters<typeof Actual0.useSearch>['length'], ExpectedPublicContracts[52]>
>;
type Contract_53_useLoaderData = Assert<
	Equal<Parameters<typeof Actual0.useLoaderData>['length'], ExpectedPublicContracts[53]>
>;
type Contract_54_useLoaderDeps = Assert<
	Equal<Parameters<typeof Actual0.useLoaderDeps>['length'], ExpectedPublicContracts[54]>
>;
type Contract_55_useRouteContext = Assert<
	Equal<Parameters<typeof Actual0.useRouteContext>['length'], ExpectedPublicContracts[55]>
>;
type Contract_56_useMatches = Assert<
	Equal<Parameters<typeof Actual0.useMatches>['length'], ExpectedPublicContracts[56]>
>;
type Contract_57_useParentMatches = Assert<
	Equal<Parameters<typeof Actual0.useParentMatches>['length'], ExpectedPublicContracts[57]>
>;
type Contract_58_useChildMatches = Assert<
	Equal<Parameters<typeof Actual0.useChildMatches>['length'], ExpectedPublicContracts[58]>
>;
type Contract_59_useNavigate = Assert<
	Equal<Parameters<typeof Actual0.useNavigate>['length'], ExpectedPublicContracts[59]>
>;
type Contract_60_useCanGoBack = Assert<
	Equal<Parameters<typeof Actual0.useCanGoBack>['length'], ExpectedPublicContracts[60]>
>;
type Contract_61_UseLoaderDataBaseOptions = Assert<
	Equal<
		keyof Actual0.UseLoaderDataBaseOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[61]
	>
>;
type Contract_62_UseLoaderDataOptions = Assert<
	Equal<
		keyof Actual0.UseLoaderDataOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[62]
	>
>;
type Contract_63_UseLoaderDataRoute = Assert<
	Equal<keyof Actual0.UseLoaderDataRoute<'/example'>, ExpectedPublicContracts[63]>
>;
type Contract_64_UseLoaderDepsBaseOptions = Assert<
	Equal<
		keyof Actual0.UseLoaderDepsBaseOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[64]
	>
>;
type Contract_65_UseLoaderDepsOptions = Assert<
	Equal<
		keyof Actual0.UseLoaderDepsOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[65]
	>
>;
type Contract_66_UseLoaderDepsRoute = Assert<
	Equal<keyof Actual0.UseLoaderDepsRoute<'/example'>, ExpectedPublicContracts[66]>
>;
type Contract_67_UseLocationBaseOptions = Assert<
	Equal<
		keyof Actual0.UseLocationBaseOptions<
			import('@tanstack/router-core').AnyRouter,
			{ value: string }
		>,
		ExpectedPublicContracts[67]
	>
>;
type Contract_68_UseLocationResult = Assert<
	Equal<
		keyof Actual0.UseLocationResult<import('@tanstack/router-core').AnyRouter, { value: string }>,
		ExpectedPublicContracts[68]
	>
>;
type Contract_69_UseMatchBaseOptions = Assert<
	Equal<
		keyof Actual0.UseMatchBaseOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			true,
			{ value: string },
			true
		>,
		ExpectedPublicContracts[69]
	>
>;
type Contract_70_UseMatchOptions = Assert<
	Equal<
		keyof Actual0.UseMatchOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			true,
			{ value: string },
			true
		>,
		ExpectedPublicContracts[70]
	>
>;
type Contract_71_UseMatchResult = Assert<
	Equal<
		keyof Actual0.UseMatchResult<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string }
		>,
		ExpectedPublicContracts[71]
	>
>;
type Contract_72_UseMatchRoute = Assert<
	Equal<keyof Actual0.UseMatchRoute<'/example'>, ExpectedPublicContracts[72]>
>;
type Contract_73_UseMatchesBaseOptions = Assert<
	Equal<
		keyof Actual0.UseMatchesBaseOptions<
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[73]
	>
>;
type Contract_74_UseMatchesResult = Assert<
	Equal<
		keyof Actual0.UseMatchesResult<import('@tanstack/router-core').AnyRouter, { value: string }>,
		ExpectedPublicContracts[74]
	>
>;
type Contract_75_UseParamsBaseOptions = Assert<
	Equal<
		keyof Actual0.UseParamsBaseOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			true,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[75]
	>
>;
type Contract_76_UseParamsOptions = Assert<
	Equal<
		keyof Actual0.UseParamsOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			true,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[76]
	>
>;
type Contract_77_UseParamsRoute = Assert<
	Equal<keyof Actual0.UseParamsRoute<'/example'>, ExpectedPublicContracts[77]>
>;
type Contract_78_UseRouteContextRoute = Assert<
	Equal<keyof Actual0.UseRouteContextRoute<'/example'>, ExpectedPublicContracts[78]>
>;
type Contract_79_UseSearchBaseOptions = Assert<
	Equal<
		keyof Actual0.UseSearchBaseOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			true,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[79]
	>
>;
type Contract_80_UseSearchOptions = Assert<
	Equal<
		keyof Actual0.UseSearchOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			true,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[80]
	>
>;
type Contract_81_UseSearchRoute = Assert<
	Equal<keyof Actual0.UseSearchRoute<'/example'>, ExpectedPublicContracts[81]>
>;
type Contract_82_useAwaited = Assert<
	Equal<Parameters<typeof Actual0.useAwaited>['length'], ExpectedPublicContracts[82]>
>;
type Contract_83_AwaitOptions = Assert<
	Equal<keyof Actual0.AwaitOptions<{ value: string }>, ExpectedPublicContracts[83]>
>;
type Contract_84_useLinkProps = Assert<
	Equal<Parameters<typeof Actual0.useLinkProps>['length'], ExpectedPublicContracts[84]>
>;
type Contract_85_createLink = Assert<
	Equal<Parameters<typeof Actual0.createLink>['length'], ExpectedPublicContracts[85]>
>;
type Contract_86_linkOptions = Assert<
	Equal<Parameters<typeof Actual0.linkOptions>['length'], ExpectedPublicContracts[86]>
>;
type Contract_87_LinkOptionsFn = Assert<
	Equal<keyof Actual0.LinkOptionsFn<'a'>, ExpectedPublicContracts[87]>
>;
type Contract_88_LinkOptionsFnOptions = Assert<
	Equal<keyof Actual0.LinkOptionsFnOptions<{ value: string }, 'a'>, ExpectedPublicContracts[88]>
>;
type Contract_89_ActiveLinkOptionProps = Assert<
	Equal<keyof Actual0.ActiveLinkOptionProps, ExpectedPublicContracts[89]>
>;
type Contract_90_ActiveLinkOptions = Assert<
	Equal<keyof Actual0.ActiveLinkOptions, ExpectedPublicContracts[90]>
>;
type Contract_91_CreateLinkProps = Assert<
	Equal<keyof Actual0.CreateLinkProps, ExpectedPublicContracts[91]>
>;
type Contract_92_LinkComponent = Assert<
	Equal<keyof Actual0.LinkComponent<'a'>, ExpectedPublicContracts[92]>
>;
type Contract_93_LinkComponentProps = Assert<
	Equal<
		keyof Omit<
			Actual0.LinkComponentProps,
			| keyof import('octane/jsx-runtime').Octane.JSX.IntrinsicElements['a']
			| keyof import('octane/jsx-runtime').Octane.JSX.IntrinsicAttributes
		>,
		ExpectedPublicContracts[93]
	>
>;
type Contract_94_LinkComponentRoute = Assert<
	Equal<keyof Actual0.LinkComponentRoute, ExpectedPublicContracts[94]>
>;
type Contract_95_LinkProps = Assert<Equal<keyof Actual0.LinkProps, ExpectedPublicContracts[95]>>;
type Contract_96_LinkPropsChildren = Assert<
	Equal<keyof Actual0.LinkPropsChildren, ExpectedPublicContracts[96]>
>;
type Contract_97_OctaneAnchorProps = Assert<
	Equal<keyof Actual0.OctaneAnchorProps, ExpectedPublicContracts[97]>
>;
type Contract_98_OctaneRenderable = Assert<
	Equal<keyof Actual0.OctaneRenderable, ExpectedPublicContracts[98]>
>;
type Contract_99_UseLinkPropsOptions = Assert<
	Equal<
		keyof Omit<
			Actual0.UseLinkPropsOptions,
			| keyof import('octane/jsx-runtime').Octane.JSX.IntrinsicElements['a']
			| keyof import('octane/jsx-runtime').Octane.JSX.IntrinsicAttributes
		>,
		ExpectedPublicContracts[99]
	>
>;
type Contract_100_useBlocker = Assert<
	Equal<Parameters<typeof Actual0.useBlocker>['length'], ExpectedPublicContracts[100]>
>;
type Contract_101_Block = Assert<
	Equal<Parameters<typeof Actual0.Block>['length'], ExpectedPublicContracts[101]>
>;
type Contract_102_BlockerResolver = Assert<
	Equal<keyof Actual0.BlockerResolver, ExpectedPublicContracts[102]>
>;
type Contract_103_ShouldBlockFn = Assert<
	Equal<keyof Actual0.ShouldBlockFn, ExpectedPublicContracts[103]>
>;
type Contract_104_ShouldBlockFnArgs = Assert<
	Equal<keyof Actual0.ShouldBlockFnArgs, ExpectedPublicContracts[104]>
>;
type Contract_105_UseBlockerOpts = Assert<
	Equal<keyof Actual0.UseBlockerOpts, ExpectedPublicContracts[105]>
>;
type Contract_106_useMatchRoute = Assert<
	Equal<Parameters<typeof Actual0.useMatchRoute>['length'], ExpectedPublicContracts[106]>
>;
type Contract_107_MatchRoute = Assert<
	Equal<Parameters<typeof Actual0.MatchRoute>['length'], ExpectedPublicContracts[107]>
>;
type Contract_108_UseMatchRouteOptions = Assert<
	Equal<keyof Actual0.UseMatchRouteOptions, ExpectedPublicContracts[108]>
>;
type Contract_109_MakeMatchRouteOptions = Assert<
	Equal<keyof Actual0.MakeMatchRouteOptions, ExpectedPublicContracts[109]>
>;
type Contract_110_useElementScrollRestoration = Assert<
	Equal<
		Parameters<typeof Actual0.useElementScrollRestoration>['length'],
		ExpectedPublicContracts[110]
	>
>;
type Contract_111_lazyRouteComponent = Assert<
	Equal<Parameters<typeof Actual0.lazyRouteComponent>['length'], ExpectedPublicContracts[111]>
>;
type Contract_112_RouterProvider = Assert<
	Equal<Parameters<typeof Actual0.RouterProvider>['length'], ExpectedPublicContracts[112]>
>;
type Contract_113_RouterContextProvider = Assert<
	Equal<Parameters<typeof Actual0.RouterContextProvider>['length'], ExpectedPublicContracts[113]>
>;
type Contract_114_RouterProps = Assert<
	Equal<keyof Actual0.RouterProps, ExpectedPublicContracts[114]>
>;
type Contract_115_Outlet = Assert<
	Equal<Parameters<typeof Actual0.Outlet>['length'], ExpectedPublicContracts[115]>
>;
type Contract_116_Link = Assert<
	Equal<Parameters<typeof Actual0.Link>['length'], ExpectedPublicContracts[116]>
>;
type Contract_117_Navigate = Assert<
	Equal<Parameters<typeof Actual0.Navigate>['length'], ExpectedPublicContracts[117]>
>;
type Contract_118_Await = Assert<
	Equal<Parameters<typeof Actual0.Await>['length'], ExpectedPublicContracts[118]>
>;
type Contract_119_ScrollRestoration = Assert<
	Equal<Parameters<typeof Actual0.ScrollRestoration>['length'], ExpectedPublicContracts[119]>
>;
type Contract_120_Matches = Assert<
	Equal<Parameters<typeof Actual0.Matches>['length'], ExpectedPublicContracts[120]>
>;
type Contract_121_Match = Assert<
	Equal<Parameters<typeof Actual0.Match>['length'], ExpectedPublicContracts[121]>
>;
type Contract_122_CatchBoundary = Assert<
	Equal<keyof Parameters<typeof Actual0.CatchBoundary>[0], ExpectedPublicContracts[122]>
>;
type Contract_123_ErrorComponent = Assert<
	Equal<Parameters<typeof Actual0.ErrorComponent>['length'], ExpectedPublicContracts[123]>
>;
type Contract_124_CatchNotFound = Assert<
	Equal<Parameters<typeof Actual0.CatchNotFound>['length'], ExpectedPublicContracts[124]>
>;
type Contract_125_DefaultGlobalNotFound = Assert<
	Equal<Parameters<typeof Actual0.DefaultGlobalNotFound>['length'], ExpectedPublicContracts[125]>
>;
type Contract_126_ClientOnly = Assert<
	Equal<Parameters<typeof Actual0.ClientOnly>['length'], ExpectedPublicContracts[126]>
>;
type Contract_127_useHydrated = Assert<
	Equal<Parameters<typeof Actual0.useHydrated>['length'], ExpectedPublicContracts[127]>
>;
type Contract_128_HeadContent = Assert<
	Equal<Parameters<typeof Actual0.HeadContent>['length'], ExpectedPublicContracts[128]>
>;
type Contract_129_HeadContentProps = Assert<
	Equal<keyof Actual0.HeadContentProps, ExpectedPublicContracts[129]>
>;
type Contract_130_Scripts = Assert<
	Equal<Parameters<typeof Actual0.Scripts>['length'], ExpectedPublicContracts[130]>
>;
type Contract_131_ScriptOnce = Assert<
	Equal<Parameters<typeof Actual0.ScriptOnce>['length'], ExpectedPublicContracts[131]>
>;
type Contract_132_Asset = Assert<
	Equal<Parameters<typeof Actual0.Asset>['length'], ExpectedPublicContracts[132]>
>;
type Contract_133_AssetProps = Assert<
	Equal<keyof Actual0.AssetProps, ExpectedPublicContracts[133]>
>;
type Contract_134_useTags = Assert<
	Equal<Parameters<typeof Actual0.useTags>['length'], ExpectedPublicContracts[134]>
>;
type Contract_135_Html = Assert<
	Equal<Parameters<typeof Actual0.Html>['length'], ExpectedPublicContracts[135]>
>;
type Contract_136_HtmlProps = Assert<Equal<keyof Actual0.HtmlProps, ExpectedPublicContracts[136]>>;
type Contract_137_Head = Assert<
	Equal<Parameters<typeof Actual0.Head>['length'], ExpectedPublicContracts[137]>
>;
type Contract_138_HeadProps = Assert<Equal<keyof Actual0.HeadProps, ExpectedPublicContracts[138]>>;
type Contract_139_Body = Assert<
	Equal<Parameters<typeof Actual0.Body>['length'], ExpectedPublicContracts[139]>
>;
type Contract_140_BodyProps = Assert<Equal<keyof Actual0.BodyProps, ExpectedPublicContracts[140]>>;
type Contract_141_OctaneElementAttributes = Assert<
	Equal<keyof Actual0.OctaneElementAttributes, ExpectedPublicContracts[141]>
>;
type Contract_142_OctaneScriptAttributes = Assert<
	Equal<keyof Actual0.OctaneScriptAttributes, ExpectedPublicContracts[142]>
>;
type Contract_143_InferStructuralSharing = Assert<
	Equal<keyof Actual0.InferStructuralSharing<{ value: string }>, ExpectedPublicContracts[143]>
>;
type Contract_144_ValidateLinkOptions = Assert<
	Equal<
		keyof Omit<
			Actual0.ValidateLinkOptions,
			| keyof import('octane/jsx-runtime').Octane.JSX.IntrinsicElements['a']
			| keyof import('octane/jsx-runtime').Octane.JSX.IntrinsicAttributes
		>,
		ExpectedPublicContracts[144]
	>
>;
type Contract_145_ValidateLinkOptionsArray = Assert<
	Equal<keyof Actual0.ValidateLinkOptionsArray, ExpectedPublicContracts[145]>
>;
type Contract_146_ValidateUseParamsOptions = Assert<
	Equal<keyof Actual0.ValidateUseParamsOptions<{ value: string }>, ExpectedPublicContracts[146]>
>;
type Contract_147_ValidateUseSearchOptions = Assert<
	Equal<keyof Actual0.ValidateUseSearchOptions<{ value: string }>, ExpectedPublicContracts[147]>
>;
type Contract_148_TSR_DEFERRED_PROMISE = Assert<
	Equal<keyof typeof Actual0.TSR_DEFERRED_PROMISE, ExpectedPublicContracts[148]>
>;
type Contract_149_defer = Assert<
	Equal<Parameters<typeof Actual0.defer>['length'], ExpectedPublicContracts[149]>
>;
type Contract_150_DeferredPromiseState = Assert<
	Equal<keyof Actual0.DeferredPromiseState<{ value: string }>, ExpectedPublicContracts[150]>
>;
type Contract_151_DeferredPromise = Assert<
	Equal<keyof Actual0.DeferredPromise<{ value: string }>, ExpectedPublicContracts[151]>
>;
type Contract_152_invariant = Assert<
	Equal<Parameters<typeof Actual0.invariant>['length'], ExpectedPublicContracts[152]>
>;
type Contract_153_preloadWarning = Assert<
	Equal<keyof typeof Actual0.preloadWarning, ExpectedPublicContracts[153]>
>;
type Contract_154_IsRequiredParams = Assert<
	Equal<Actual0.IsRequiredParams<{ value: string }>, ExpectedPublicContracts[154]>
>;
type Contract_155_AddTrailingSlash = Assert<
	Equal<Actual0.AddTrailingSlash<{ value: string }>, ExpectedPublicContracts[155]>
>;
type Contract_156_RemoveTrailingSlashes = Assert<
	Equal<keyof Actual0.RemoveTrailingSlashes<{ value: string }>, ExpectedPublicContracts[156]>
>;
type Contract_157_AddLeadingSlash = Assert<
	Equal<keyof Actual0.AddLeadingSlash<{ value: string }>, ExpectedPublicContracts[157]>
>;
type Contract_158_RemoveLeadingSlashes = Assert<
	Equal<keyof Actual0.RemoveLeadingSlashes<{ value: string }>, ExpectedPublicContracts[158]>
>;
type Contract_159_ActiveOptions = Assert<
	Equal<keyof Actual0.ActiveOptions, ExpectedPublicContracts[159]>
>;
type Contract_160_LinkOptionsProps = Assert<
	Equal<keyof Actual0.LinkOptionsProps, ExpectedPublicContracts[160]>
>;
type Contract_161_ResolveCurrentPath = Assert<
	Equal<Actual0.ResolveCurrentPath<'/example', '/example'>, ExpectedPublicContracts[161]>
>;
type Contract_162_ResolveParentPath = Assert<
	Equal<Actual0.ResolveParentPath<'/example', '/example'>, ExpectedPublicContracts[162]>
>;
type Contract_163_ResolveRelativePath = Assert<
	Equal<Actual0.ResolveRelativePath<'/example'>, ExpectedPublicContracts[163]>
>;
type Contract_164_FindDescendantToPaths = Assert<
	Equal<
		keyof Actual0.FindDescendantToPaths<import('@tanstack/router-core').AnyRouter, '/example'>,
		ExpectedPublicContracts[164]
	>
>;
type Contract_165_InferDescendantToPaths = Assert<
	Equal<
		Actual0.InferDescendantToPaths<import('@tanstack/router-core').AnyRouter, '/example'>,
		ExpectedPublicContracts[165]
	>
>;
type Contract_166_RelativeToPath = Assert<
	Equal<
		Actual0.RelativeToPath<import('@tanstack/router-core').AnyRouter, '/example', '/example'>,
		ExpectedPublicContracts[166]
	>
>;
type Contract_167_RelativeToParentPath = Assert<
	Equal<
		Actual0.RelativeToParentPath<import('@tanstack/router-core').AnyRouter, '/example', '/example'>,
		ExpectedPublicContracts[167]
	>
>;
type Contract_168_RelativeToCurrentPath = Assert<
	Equal<
		Actual0.RelativeToCurrentPath<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			'/example'
		>,
		ExpectedPublicContracts[168]
	>
>;
type Contract_169_AbsoluteToPath = Assert<
	Equal<
		keyof Actual0.AbsoluteToPath<import('@tanstack/router-core').AnyRouter, '/example'>,
		ExpectedPublicContracts[169]
	>
>;
type Contract_170_RelativeToPathAutoComplete = Assert<
	Equal<
		keyof Actual0.RelativeToPathAutoComplete<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			'/example'
		>,
		ExpectedPublicContracts[170]
	>
>;
type Contract_171_NavigateOptions = Assert<
	Equal<keyof Actual0.NavigateOptions, ExpectedPublicContracts[171]>
>;
type Contract_172_ToOptions = Assert<Equal<keyof Actual0.ToOptions, ExpectedPublicContracts[172]>>;
type Contract_173_ToMaskOptions = Assert<
	Equal<keyof Actual0.ToMaskOptions, ExpectedPublicContracts[173]>
>;
type Contract_174_ToSubOptions = Assert<
	Equal<keyof Actual0.ToSubOptions, ExpectedPublicContracts[174]>
>;
type Contract_175_ResolveRoute = Assert<
	Equal<
		keyof Actual0.ResolveRoute<import('@tanstack/router-core').AnyRouter, '/example', '/example'>,
		ExpectedPublicContracts[175]
	>
>;
type Contract_176_SearchParamOptions = Assert<
	Equal<
		keyof Actual0.SearchParamOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			'/example'
		>,
		ExpectedPublicContracts[176]
	>
>;
type Contract_177_PathParamOptions = Assert<
	Equal<
		keyof Actual0.PathParamOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			'/example'
		>,
		ExpectedPublicContracts[177]
	>
>;
type Contract_178_ToPathOption = Assert<Equal<Actual0.ToPathOption, ExpectedPublicContracts[178]>>;
type Contract_179_LinkOptions = Assert<
	Equal<keyof Actual0.LinkOptions, ExpectedPublicContracts[179]>
>;
type Contract_180_MakeOptionalPathParams = Assert<
	Equal<
		keyof Actual0.MakeOptionalPathParams<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			'/example'
		>,
		ExpectedPublicContracts[180]
	>
>;
type Contract_181_FromPathOption = Assert<
	Equal<
		Actual0.FromPathOption<import('@tanstack/router-core').AnyRouter, '/example'>,
		ExpectedPublicContracts[181]
	>
>;
type Contract_182_MakeOptionalSearchParams = Assert<
	Equal<
		keyof Actual0.MakeOptionalSearchParams<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			'/example'
		>,
		ExpectedPublicContracts[182]
	>
>;
type Contract_183_MaskOptions = Assert<
	Equal<
		keyof Actual0.MaskOptions<import('@tanstack/router-core').AnyRouter, '/example', '/example'>,
		ExpectedPublicContracts[183]
	>
>;
type Contract_184_ToSubOptionsProps = Assert<
	Equal<keyof Actual0.ToSubOptionsProps, ExpectedPublicContracts[184]>
>;
type Contract_185_RequiredToOptions = Assert<
	Equal<
		keyof Actual0.RequiredToOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			'/example'
		>,
		ExpectedPublicContracts[185]
	>
>;
type Contract_186_RouteToPath = Assert<
	Equal<
		keyof Actual0.RouteToPath<import('@tanstack/router-core').AnyRouter>,
		ExpectedPublicContracts[186]
	>
>;
type Contract_187_TrailingSlashOptionByRouter = Assert<
	Equal<
		Actual0.TrailingSlashOptionByRouter<import('@tanstack/router-core').AnyRouter>,
		ExpectedPublicContracts[187]
	>
>;
type Contract_188_ParseRoute = Assert<
	Equal<keyof Actual0.ParseRoute<Actual0.RootRoute>, ExpectedPublicContracts[188]>
>;
type Contract_189_CodeRouteToPath = Assert<
	Equal<
		keyof Actual0.CodeRouteToPath<import('@tanstack/router-core').AnyRouter>,
		ExpectedPublicContracts[189]
	>
>;
type Contract_190_RouteIds = Assert<
	Equal<Actual0.RouteIds<Actual0.RootRoute>, ExpectedPublicContracts[190]>
>;
type Contract_191_FullSearchSchema = Assert<
	Equal<keyof Actual0.FullSearchSchema<Actual0.RootRoute>, ExpectedPublicContracts[191]>
>;
type Contract_192_FullSearchSchemaInput = Assert<
	Equal<keyof Actual0.FullSearchSchemaInput<Actual0.RootRoute>, ExpectedPublicContracts[192]>
>;
type Contract_193_AllParams = Assert<
	Equal<keyof Actual0.AllParams<Actual0.RootRoute>, ExpectedPublicContracts[193]>
>;
type Contract_194_RouteById = Assert<
	Equal<Actual0.RouteById<Actual0.RootRoute, '/example'>, ExpectedPublicContracts[194]>
>;
type Contract_195_AllContext = Assert<
	Equal<keyof Actual0.AllContext<Actual0.RootRoute>, ExpectedPublicContracts[195]>
>;
type Contract_196_RoutePaths = Assert<
	Equal<Actual0.RoutePaths<Actual0.RootRoute>, ExpectedPublicContracts[196]>
>;
type Contract_197_RoutesById = Assert<
	Equal<keyof Actual0.RoutesById<Actual0.RootRoute>, ExpectedPublicContracts[197]>
>;
type Contract_198_RoutesByPath = Assert<
	Equal<keyof Actual0.RoutesByPath<Actual0.RootRoute>, ExpectedPublicContracts[198]>
>;
type Contract_199_AllLoaderData = Assert<
	Equal<Actual0.AllLoaderData<Actual0.RootRoute>, ExpectedPublicContracts[199]>
>;
type Contract_200_RouteByPath = Assert<
	Equal<Actual0.RouteByPath<Actual0.RootRoute, '/example'>, ExpectedPublicContracts[200]>
>;
type Contract_201_InferFileRouteTypes = Assert<
	Equal<Actual0.InferFileRouteTypes<Actual0.RootRoute>, ExpectedPublicContracts[201]>
>;
type Contract_202_FileRouteTypes = Assert<
	Equal<keyof Actual0.FileRouteTypes, ExpectedPublicContracts[202]>
>;
type Contract_203_FileRoutesByPath = Assert<
	Equal<keyof Actual0.FileRoutesByPath, ExpectedPublicContracts[203]>
>;
type Contract_204_CreateFileRoute = Assert<
	Equal<
		keyof Actual0.CreateFileRoute<
			'/example',
			Actual0.RootRoute,
			'/example',
			'/example',
			'/example'
		>,
		ExpectedPublicContracts[204]
	>
>;
type Contract_205_LazyRouteOptions = Assert<
	Equal<keyof Actual0.LazyRouteOptions, ExpectedPublicContracts[205]>
>;
type Contract_206_CreateLazyFileRoute = Assert<
	Equal<keyof Actual0.CreateLazyFileRoute<Actual0.RootRoute>, ExpectedPublicContracts[206]>
>;
type Contract_207_ParsedLocation = Assert<
	Equal<keyof Actual0.ParsedLocation, ExpectedPublicContracts[207]>
>;
type Contract_208_Manifest = Assert<Equal<keyof Actual0.Manifest, ExpectedPublicContracts[208]>>;
type Contract_209_ServerManifest = Assert<
	Equal<keyof Actual0.ServerManifest, ExpectedPublicContracts[209]>
>;
type Contract_210_ManifestRoute = Assert<
	Equal<keyof Actual0.ManifestRoute, ExpectedPublicContracts[210]>
>;
type Contract_211_ManifestRouteAssets = Assert<
	Equal<keyof Actual0.ManifestRouteAssets, ExpectedPublicContracts[211]>
>;
type Contract_212_ServerManifestRoute = Assert<
	Equal<keyof Actual0.ServerManifestRoute, ExpectedPublicContracts[212]>
>;
type Contract_213_ManifestCssLink = Assert<
	Equal<keyof Actual0.ManifestCssLink, ExpectedPublicContracts[213]>
>;
type Contract_214_ManifestInlineCss = Assert<
	Equal<keyof Actual0.ManifestInlineCss, ExpectedPublicContracts[214]>
>;
type Contract_215_ServerManifestInlineCss = Assert<
	Equal<keyof Actual0.ServerManifestInlineCss, ExpectedPublicContracts[215]>
>;
type Contract_216_InlineCssTemplate = Assert<
	Equal<keyof Actual0.InlineCssTemplate, ExpectedPublicContracts[216]>
>;
type Contract_217_ManifestScript = Assert<
	Equal<keyof Actual0.ManifestScript, ExpectedPublicContracts[217]>
>;
type Contract_218_RouterManagedTag = Assert<
	Equal<keyof Actual0.RouterManagedTag, ExpectedPublicContracts[218]>
>;
type Contract_219_RouterManagedTitleTag = Assert<
	Equal<keyof Actual0.RouterManagedTitleTag, ExpectedPublicContracts[219]>
>;
type Contract_220_RouterManagedMetaTag = Assert<
	Equal<keyof Actual0.RouterManagedMetaTag, ExpectedPublicContracts[220]>
>;
type Contract_221_RouterManagedInlineCssTag = Assert<
	Equal<keyof Actual0.RouterManagedInlineCssTag, ExpectedPublicContracts[221]>
>;
type Contract_222_RouterManagedScriptTag = Assert<
	Equal<keyof Actual0.RouterManagedScriptTag, ExpectedPublicContracts[222]>
>;
type Contract_223_RouterManagedLinkTag = Assert<
	Equal<keyof Actual0.RouterManagedLinkTag, ExpectedPublicContracts[223]>
>;
type Contract_224_RouterManagedStyleTag = Assert<
	Equal<keyof Actual0.RouterManagedStyleTag, ExpectedPublicContracts[224]>
>;
type Contract_225_AssetCrossOrigin = Assert<
	Equal<Actual0.AssetCrossOrigin, ExpectedPublicContracts[225]>
>;
type Contract_226_AssetCrossOriginConfig = Assert<
	Equal<keyof Actual0.AssetCrossOriginConfig, ExpectedPublicContracts[226]>
>;
type Contract_227_ManifestAssetLink = Assert<
	Equal<keyof Actual0.ManifestAssetLink, ExpectedPublicContracts[227]>
>;
type Contract_228_ScriptFormat = Assert<Equal<Actual0.ScriptFormat, ExpectedPublicContracts[228]>>;
type Contract_229_DEV_STYLES_ATTR = Assert<
	Equal<keyof typeof Actual0.DEV_STYLES_ATTR, ExpectedPublicContracts[229]>
>;
type Contract_230_appendUniqueUserTags = Assert<
	Equal<Parameters<typeof Actual0.appendUniqueUserTags>['length'], ExpectedPublicContracts[230]>
>;
type Contract_231_createInlineCssStyleAsset = Assert<
	Equal<
		Parameters<typeof Actual0.createInlineCssStyleAsset>['length'],
		ExpectedPublicContracts[231]
	>
>;
type Contract_232_getAssetCrossOrigin = Assert<
	Equal<Parameters<typeof Actual0.getAssetCrossOrigin>['length'], ExpectedPublicContracts[232]>
>;
type Contract_233_getManifestScriptFormat = Assert<
	Equal<Parameters<typeof Actual0.getManifestScriptFormat>['length'], ExpectedPublicContracts[233]>
>;
type Contract_234_getScriptPreloadAttrs = Assert<
	Equal<Parameters<typeof Actual0.getScriptPreloadAttrs>['length'], ExpectedPublicContracts[234]>
>;
type Contract_235_getStylesheetHref = Assert<
	Equal<Parameters<typeof Actual0.getStylesheetHref>['length'], ExpectedPublicContracts[235]>
>;
type Contract_236_resolveManifestAssetLink = Assert<
	Equal<Parameters<typeof Actual0.resolveManifestAssetLink>['length'], ExpectedPublicContracts[236]>
>;
type Contract_237_resolveManifestCssLink = Assert<
	Equal<Parameters<typeof Actual0.resolveManifestCssLink>['length'], ExpectedPublicContracts[237]>
>;
type Contract_238_isMatch = Assert<
	Equal<Parameters<typeof Actual0.isMatch>['length'], ExpectedPublicContracts[238]>
>;
type Contract_239__getAssetMatches = Assert<
	Equal<Parameters<typeof Actual0._getAssetMatches>['length'], ExpectedPublicContracts[239]>
>;
type Contract_240__getRenderedMatches = Assert<
	Equal<Parameters<typeof Actual0._getRenderedMatches>['length'], ExpectedPublicContracts[240]>
>;
type Contract_241_AnyMatchAndValue = Assert<
	Equal<keyof Actual0.AnyMatchAndValue, ExpectedPublicContracts[241]>
>;
type Contract_242_FindValueByIndex = Assert<
	Equal<
		Actual0.FindValueByIndex<{ value: string }, readonly ['first', 'second']>,
		ExpectedPublicContracts[242]
	>
>;
type Contract_243_FindValueByKey = Assert<
	Equal<
		keyof Actual0.FindValueByKey<{ value: string }, { value: string }>,
		ExpectedPublicContracts[243]
	>
>;
type Contract_244_CreateMatchAndValue = Assert<
	Equal<
		keyof Actual0.CreateMatchAndValue<{ value: string }, { value: string }>,
		ExpectedPublicContracts[244]
	>
>;
type Contract_245_NextMatchAndValue = Assert<
	Equal<
		keyof Actual0.NextMatchAndValue<
			{ value: string },
			{ match: { id: '/example' }; value: { value: string } }
		>,
		ExpectedPublicContracts[245]
	>
>;
type Contract_246_IsMatchKeyOf = Assert<
	Equal<Actual0.IsMatchKeyOf<{ value: string }>, ExpectedPublicContracts[246]>
>;
type Contract_247_IsMatchPath = Assert<
	Equal<
		Actual0.IsMatchPath<'/example', { match: { id: '/example' }; value: { value: string } }>,
		ExpectedPublicContracts[247]
	>
>;
type Contract_248_IsMatchResult = Assert<
	Equal<
		Actual0.IsMatchResult<
			{ value: string },
			{ match: { id: '/example' }; value: { value: string } }
		>,
		ExpectedPublicContracts[248]
	>
>;
type Contract_249_IsMatchParse = Assert<
	Equal<
		keyof Actual0.IsMatchParse<'/example', { match: { id: '/example' }; value: { value: string } }>,
		ExpectedPublicContracts[249]
	>
>;
type Contract_250_IsMatch = Assert<
	Equal<keyof Actual0.IsMatch<{ value: string }, '/example'>, ExpectedPublicContracts[250]>
>;
type Contract_251_RouteMatch = Assert<
	Equal<
		keyof Actual0.RouteMatch<
			{ value: string },
			'/example',
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[251]
	>
>;
type Contract_252_RouteMatchExtensions = Assert<
	Equal<keyof Actual0.RouteMatchExtensions, ExpectedPublicContracts[252]>
>;
type Contract_253_MakeRouteMatchUnion = Assert<
	Equal<keyof Actual0.MakeRouteMatchUnion, ExpectedPublicContracts[253]>
>;
type Contract_254_MakeRouteMatch = Assert<
	Equal<keyof Actual0.MakeRouteMatch, ExpectedPublicContracts[254]>
>;
type Contract_255_AnyRouteMatch = Assert<
	Equal<keyof Actual0.AnyRouteMatch, ExpectedPublicContracts[255]>
>;
type Contract_256_MakeRouteMatchFromRoute = Assert<
	Equal<keyof Actual0.MakeRouteMatchFromRoute<Actual0.RootRoute>, ExpectedPublicContracts[256]>
>;
type Contract_257_MatchRouteOptions = Assert<
	Equal<keyof Actual0.MatchRouteOptions, ExpectedPublicContracts[257]>
>;
type Contract_258_joinPaths = Assert<
	Equal<Parameters<typeof Actual0.joinPaths>['length'], ExpectedPublicContracts[258]>
>;
type Contract_259_cleanPath = Assert<
	Equal<Parameters<typeof Actual0.cleanPath>['length'], ExpectedPublicContracts[259]>
>;
type Contract_260_trimPathLeft = Assert<
	Equal<Parameters<typeof Actual0.trimPathLeft>['length'], ExpectedPublicContracts[260]>
>;
type Contract_261_trimPathRight = Assert<
	Equal<Parameters<typeof Actual0.trimPathRight>['length'], ExpectedPublicContracts[261]>
>;
type Contract_262_trimPath = Assert<
	Equal<Parameters<typeof Actual0.trimPath>['length'], ExpectedPublicContracts[262]>
>;
type Contract_263_removeTrailingSlash = Assert<
	Equal<Parameters<typeof Actual0.removeTrailingSlash>['length'], ExpectedPublicContracts[263]>
>;
type Contract_264_exactPathTest = Assert<
	Equal<Parameters<typeof Actual0.exactPathTest>['length'], ExpectedPublicContracts[264]>
>;
type Contract_265_resolvePath = Assert<
	Equal<Parameters<typeof Actual0.resolvePath>['length'], ExpectedPublicContracts[265]>
>;
type Contract_266_interpolatePath = Assert<
	Equal<Parameters<typeof Actual0.interpolatePath>['length'], ExpectedPublicContracts[266]>
>;
type Contract_267_encode = Assert<
	Equal<Parameters<typeof Actual0.encode>['length'], ExpectedPublicContracts[267]>
>;
type Contract_268_decode = Assert<
	Equal<Parameters<typeof Actual0.decode>['length'], ExpectedPublicContracts[268]>
>;
type Contract_269_rootRouteId = Assert<
	Equal<keyof typeof Actual0.rootRouteId, ExpectedPublicContracts[269]>
>;
type Contract_270_RootRouteId = Assert<Equal<Actual0.RootRouteId, ExpectedPublicContracts[270]>>;
type Contract_271_BaseRoute = Assert<
	Equal<ConstructorParameters<typeof Actual0.BaseRoute>['length'], ExpectedPublicContracts[271]>
>;
type Contract_272_BaseRouteApi = Assert<
	Equal<ConstructorParameters<typeof Actual0.BaseRouteApi>['length'], ExpectedPublicContracts[272]>
>;
type Contract_273_BaseRootRoute = Assert<
	Equal<ConstructorParameters<typeof Actual0.BaseRootRoute>['length'], ExpectedPublicContracts[273]>
>;
type Contract_274_AnyPathParams = Assert<
	Equal<keyof Actual0.AnyPathParams, ExpectedPublicContracts[274]>
>;
type Contract_275_SearchSchemaInput = Assert<
	Equal<keyof Actual0.SearchSchemaInput, ExpectedPublicContracts[275]>
>;
type Contract_276_AnyContext = Assert<
	Equal<keyof Actual0.AnyContext, ExpectedPublicContracts[276]>
>;
type Contract_277_RouteContext = Assert<
	Equal<keyof Actual0.RouteContext, ExpectedPublicContracts[277]>
>;
type Contract_278_PreloadableObj = Assert<
	Equal<keyof Actual0.PreloadableObj, ExpectedPublicContracts[278]>
>;
type Contract_279_RoutePathOptions = Assert<
	Equal<keyof Actual0.RoutePathOptions<{ value: string }, '/example'>, ExpectedPublicContracts[279]>
>;
type Contract_280_StaticDataRouteOption = Assert<
	Equal<keyof Actual0.StaticDataRouteOption, ExpectedPublicContracts[280]>
>;
type Contract_281_RoutePathOptionsIntersection = Assert<
	Equal<
		keyof Actual0.RoutePathOptionsIntersection<{ value: string }, '/example'>,
		ExpectedPublicContracts[281]
	>
>;
type Contract_282_SearchFilter = Assert<
	Equal<keyof Actual0.SearchFilter<{ value: string }>, ExpectedPublicContracts[282]>
>;
type Contract_283_SearchMiddlewareContext = Assert<
	Equal<keyof Actual0.SearchMiddlewareContext<{ value: string }>, ExpectedPublicContracts[283]>
>;
type Contract_284_SearchMiddleware = Assert<
	Equal<keyof Actual0.SearchMiddleware<{ value: string }>, ExpectedPublicContracts[284]>
>;
type Contract_285_ResolveId = Assert<
	Equal<Actual0.ResolveId<Actual0.RootRoute, '/example', '/example'>, ExpectedPublicContracts[285]>
>;
type Contract_286_InferFullSearchSchema = Assert<
	Equal<keyof Actual0.InferFullSearchSchema<Actual0.RootRoute>, ExpectedPublicContracts[286]>
>;
type Contract_287_InferFullSearchSchemaInput = Assert<
	Equal<keyof Actual0.InferFullSearchSchemaInput<Actual0.RootRoute>, ExpectedPublicContracts[287]>
>;
type Contract_288_InferAllParams = Assert<
	Equal<keyof Actual0.InferAllParams<Actual0.RootRoute>, ExpectedPublicContracts[288]>
>;
type Contract_289_InferAllContext = Assert<
	Equal<keyof Actual0.InferAllContext<Actual0.RootRoute>, ExpectedPublicContracts[289]>
>;
type Contract_290_MetaDescriptor = Assert<
	Equal<keyof Actual0.MetaDescriptor, ExpectedPublicContracts[290]>
>;
type Contract_291_RouteLinkEntry = Assert<
	Equal<keyof Actual0.RouteLinkEntry, ExpectedPublicContracts[291]>
>;
type Contract_292_SearchValidator = Assert<
	Equal<
		keyof Actual0.SearchValidator<{ value: string }, { value: string }>,
		ExpectedPublicContracts[292]
	>
>;
type Contract_293_AnySearchValidator = Assert<
	Equal<keyof Actual0.AnySearchValidator, ExpectedPublicContracts[293]>
>;
type Contract_294_DefaultSearchValidator = Assert<
	Equal<keyof Actual0.DefaultSearchValidator, ExpectedPublicContracts[294]>
>;
type Contract_295_ErrorRouteProps = Assert<
	Equal<keyof Actual0.ErrorRouteProps, ExpectedPublicContracts[295]>
>;
type Contract_296_ErrorComponentProps = Assert<
	Equal<keyof Actual0.ErrorComponentProps, ExpectedPublicContracts[296]>
>;
type Contract_297_DefaultErrorBoundaryTypes = Assert<
	Equal<keyof Actual0.DefaultErrorBoundaryTypes, ExpectedPublicContracts[297]>
>;
type Contract_298_ErrorBoundaryTypes = Assert<
	Equal<keyof Actual0.ErrorBoundaryTypes, ExpectedPublicContracts[298]>
>;
type Contract_299_NotFoundRouteProps = Assert<
	Equal<keyof Actual0.NotFoundRouteProps, ExpectedPublicContracts[299]>
>;
type Contract_300_ResolveParams = Assert<
	Equal<keyof Actual0.ResolveParams<'/example'>, ExpectedPublicContracts[300]>
>;
type Contract_301_ParseParamsFn = Assert<
	Equal<keyof Actual0.ParseParamsFn<'/example', { value: string }>, ExpectedPublicContracts[301]>
>;
type Contract_302_StringifyParamsFn = Assert<
	Equal<
		keyof Actual0.StringifyParamsFn<'/example', { value: string }>,
		ExpectedPublicContracts[302]
	>
>;
type Contract_303_ParamsOptions = Assert<
	Equal<keyof Actual0.ParamsOptions<'/example', { value: string }>, ExpectedPublicContracts[303]>
>;
type Contract_304_UpdatableStaticRouteOption = Assert<
	Equal<keyof Actual0.UpdatableStaticRouteOption, ExpectedPublicContracts[304]>
>;
type Contract_305_ContextReturnType = Assert<
	Equal<keyof Actual0.ContextReturnType<{ value: string }>, ExpectedPublicContracts[305]>
>;
type Contract_306_ContextAsyncReturnType = Assert<
	Equal<keyof Actual0.ContextAsyncReturnType<{ value: string }>, ExpectedPublicContracts[306]>
>;
type Contract_307_ResolveRouteContext = Assert<
	Equal<
		keyof Actual0.ResolveRouteContext<{ value: string }, { value: string }>,
		ExpectedPublicContracts[307]
	>
>;
type Contract_308_ResolveLoaderData = Assert<
	Equal<Actual0.ResolveLoaderData<{ value: string }>, ExpectedPublicContracts[308]>
>;
type Contract_309_RoutePrefix = Assert<
	Equal<Actual0.RoutePrefix<'/example', '/example'>, ExpectedPublicContracts[309]>
>;
type Contract_310_TrimPath = Assert<
	Equal<Actual0.TrimPath<'/example'>, ExpectedPublicContracts[310]>
>;
type Contract_311_TrimPathLeft = Assert<
	Equal<Actual0.TrimPathLeft<'/example'>, ExpectedPublicContracts[311]>
>;
type Contract_312_TrimPathRight = Assert<
	Equal<Actual0.TrimPathRight<'/example'>, ExpectedPublicContracts[312]>
>;
type Contract_313_ResolveSearchSchemaFnInput = Assert<
	Equal<keyof Actual0.ResolveSearchSchemaFnInput<{ value: string }>, ExpectedPublicContracts[313]>
>;
type Contract_314_ResolveSearchSchemaInput = Assert<
	Equal<keyof Actual0.ResolveSearchSchemaInput<{ value: string }>, ExpectedPublicContracts[314]>
>;
type Contract_315_ResolveSearchSchemaFn = Assert<
	Equal<keyof Actual0.ResolveSearchSchemaFn<{ value: string }>, ExpectedPublicContracts[315]>
>;
type Contract_316_ResolveSearchSchema = Assert<
	Equal<keyof Actual0.ResolveSearchSchema<{ value: string }>, ExpectedPublicContracts[316]>
>;
type Contract_317_ResolveFullSearchSchema = Assert<
	Equal<
		keyof Actual0.ResolveFullSearchSchema<Actual0.RootRoute, { value: string }>,
		ExpectedPublicContracts[317]
	>
>;
type Contract_318_ResolveFullSearchSchemaInput = Assert<
	Equal<
		keyof Actual0.ResolveFullSearchSchemaInput<Actual0.RootRoute, { value: string }>,
		ExpectedPublicContracts[318]
	>
>;
type Contract_319_ResolveAllContext = Assert<
	Equal<
		keyof Actual0.ResolveAllContext<
			Actual0.RootRoute,
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[319]
	>
>;
type Contract_320_BeforeLoadContextParameter = Assert<
	Equal<
		keyof Actual0.BeforeLoadContextParameter<
			Actual0.RootRoute,
			import('@tanstack/router-core').AnyRouter,
			{ value: string }
		>,
		ExpectedPublicContracts[320]
	>
>;
type Contract_321_RouteContextParameter = Assert<
	Equal<
		keyof Actual0.RouteContextParameter<
			Actual0.RootRoute,
			import('@tanstack/router-core').AnyRouter
		>,
		ExpectedPublicContracts[321]
	>
>;
type Contract_322_ResolveAllParamsFromParent = Assert<
	Equal<
		keyof Actual0.ResolveAllParamsFromParent<Actual0.RootRoute, { value: string }>,
		ExpectedPublicContracts[322]
	>
>;
type Contract_323_AnyRoute = Assert<Equal<keyof Actual0.AnyRoute, ExpectedPublicContracts[323]>>;
type Contract_324_FullSearchSchemaOption = Assert<
	Equal<
		keyof Actual0.FullSearchSchemaOption<Actual0.RootRoute, { value: string }>,
		ExpectedPublicContracts[324]
	>
>;
type Contract_325_RemountDepsOptions = Assert<
	Equal<
		keyof Actual0.RemountDepsOptions<
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[325]
	>
>;
type Contract_326_MakeRemountDepsOptionsUnion = Assert<
	Equal<keyof Actual0.MakeRemountDepsOptionsUnion, ExpectedPublicContracts[326]>
>;
type Contract_327_ResolveFullPath = Assert<
	Equal<Actual0.ResolveFullPath<Actual0.RootRoute, '/example'>, ExpectedPublicContracts[327]>
>;
type Contract_328_AnyRouteWithContext = Assert<
	Equal<keyof Actual0.AnyRouteWithContext<{ value: string }>, ExpectedPublicContracts[328]>
>;
type Contract_329_RouteOptions = Assert<
	Equal<keyof Actual0.RouteOptions<{}>, ExpectedPublicContracts[329]>
>;
type Contract_330_FileBaseRouteOptions = Assert<
	Equal<keyof Actual0.FileBaseRouteOptions<{}>, ExpectedPublicContracts[330]>
>;
type Contract_331_BaseRouteOptions = Assert<
	Equal<keyof Actual0.BaseRouteOptions<{}>, ExpectedPublicContracts[331]>
>;
type Contract_332_UpdatableRouteOptions = Assert<
	Equal<
		keyof Actual0.UpdatableRouteOptions<
			Actual0.RootRoute,
			{ value: string },
			'/example',
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[332]
	>
>;
type Contract_333_LoaderStaleReloadMode = Assert<
	Equal<Actual0.LoaderStaleReloadMode, ExpectedPublicContracts[333]>
>;
type Contract_334_RouteLoaderFn = Assert<
	Equal<keyof Actual0.RouteLoaderFn<{}>, ExpectedPublicContracts[334]>
>;
type Contract_335_RouteLoaderEntry = Assert<
	Equal<keyof Actual0.RouteLoaderEntry<{}>, ExpectedPublicContracts[335]>
>;
type Contract_336_LoaderFnContext = Assert<
	Equal<keyof Actual0.LoaderFnContext, ExpectedPublicContracts[336]>
>;
type Contract_337_RouteContextFn = Assert<
	Equal<
		keyof Actual0.RouteContextFn<
			Actual0.RootRoute,
			{ value: string },
			{ value: string },
			import('@tanstack/router-core').AnyRouter,
			{ value: string }
		>,
		ExpectedPublicContracts[337]
	>
>;
type Contract_338_ContextOptions = Assert<
	Equal<
		keyof Actual0.ContextOptions<Actual0.RootRoute, { value: string }, { value: string }>,
		ExpectedPublicContracts[338]
	>
>;
type Contract_339_RouteContextOptions = Assert<
	Equal<
		keyof Actual0.RouteContextOptions<
			Actual0.RootRoute,
			{ value: string },
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[339]
	>
>;
type Contract_340_SsrContextOptions = Assert<
	Equal<
		keyof Actual0.SsrContextOptions<Actual0.RootRoute, { value: string }, { value: string }>,
		ExpectedPublicContracts[340]
	>
>;
type Contract_341_BeforeLoadContextOptions = Assert<
	Equal<
		keyof Actual0.BeforeLoadContextOptions<
			{},
			Actual0.RootRoute,
			{ value: string },
			{ value: string },
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[341]
	>
>;
type Contract_342_RootRouteOptions = Assert<
	Equal<keyof Actual0.RootRouteOptions, ExpectedPublicContracts[342]>
>;
type Contract_343_RootRouteOptionsExtensions = Assert<
	Equal<keyof Actual0.RootRouteOptionsExtensions, ExpectedPublicContracts[343]>
>;
type Contract_344_UpdatableRouteOptionsExtensions = Assert<
	Equal<keyof Actual0.UpdatableRouteOptionsExtensions, ExpectedPublicContracts[344]>
>;
type Contract_345_RouteConstraints = Assert<
	Equal<keyof Actual0.RouteConstraints, ExpectedPublicContracts[345]>
>;
type Contract_346_RouteTypesById = Assert<
	Equal<
		keyof Actual0.RouteTypesById<import('@tanstack/router-core').AnyRouter, '/example'>,
		ExpectedPublicContracts[346]
	>
>;
type Contract_347_RouteMask = Assert<
	Equal<keyof Actual0.RouteMask<Actual0.RootRoute>, ExpectedPublicContracts[347]>
>;
type Contract_348_RouteExtensions = Assert<
	Equal<keyof Actual0.RouteExtensions<'/example', '/example'>, ExpectedPublicContracts[348]>
>;
type Contract_349_RouteLazyFn = Assert<
	Equal<keyof Actual0.RouteLazyFn<Actual0.RootRoute>, ExpectedPublicContracts[349]>
>;
type Contract_350_RouteAddChildrenFn = Assert<
	Equal<
		keyof Actual0.RouteAddChildrenFn<
			{},
			Actual0.RootRoute,
			'/example',
			'/example',
			'/example',
			'/example',
			{ value: string },
			{ value: string },
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[350]
	>
>;
type Contract_351_RouteAddFileChildrenFn = Assert<
	Equal<
		keyof Actual0.RouteAddFileChildrenFn<
			{},
			Actual0.RootRoute,
			'/example',
			'/example',
			'/example',
			'/example',
			{ value: string },
			{ value: string },
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[351]
	>
>;
type Contract_352_RouteAddFileTypesFn = Assert<
	Equal<
		keyof Actual0.RouteAddFileTypesFn<
			{},
			Actual0.RootRoute,
			'/example',
			'/example',
			'/example',
			'/example',
			{ value: string },
			{ value: string },
			import('@tanstack/router-core').AnyRouter,
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string },
			{ value: string }
		>,
		ExpectedPublicContracts[352]
	>
>;
type Contract_353_ResolveOptionalParams = Assert<
	Equal<
		keyof Actual0.ResolveOptionalParams<'/example', { value: string }>,
		ExpectedPublicContracts[353]
	>
>;
type Contract_354_ResolveRequiredParams = Assert<
	Equal<
		keyof Actual0.ResolveRequiredParams<'/example', { value: string }>,
		ExpectedPublicContracts[354]
	>
>;
type Contract_355_FilebaseRouteOptionsInterface = Assert<
	Equal<keyof Actual0.FilebaseRouteOptionsInterface<{}>, ExpectedPublicContracts[355]>
>;
type Contract_356_createNonReactiveMutableStore = Assert<
	Equal<
		Parameters<typeof Actual0.createNonReactiveMutableStore>['length'],
		ExpectedPublicContracts[356]
	>
>;
type Contract_357_createNonReactiveReadonlyStore = Assert<
	Equal<
		Parameters<typeof Actual0.createNonReactiveReadonlyStore>['length'],
		ExpectedPublicContracts[357]
	>
>;
type Contract_358_RouterBatchFn = Assert<
	Equal<keyof Actual0.RouterBatchFn, ExpectedPublicContracts[358]>
>;
type Contract_359_RouterReadableStore = Assert<
	Equal<keyof Actual0.RouterReadableStore<{ value: string }>, ExpectedPublicContracts[359]>
>;
type Contract_360_GetStoreConfig = Assert<
	Equal<keyof Actual0.GetStoreConfig, ExpectedPublicContracts[360]>
>;
type Contract_361_RouterStores = Assert<
	Equal<keyof Actual0.RouterStores<Actual0.RootRoute>, ExpectedPublicContracts[361]>
>;
type Contract_362_RouterWritableStore = Assert<
	Equal<keyof Actual0.RouterWritableStore<{ value: string }>, ExpectedPublicContracts[362]>
>;
type Contract_363_defaultSerializeError = Assert<
	Equal<Parameters<typeof Actual0.defaultSerializeError>['length'], ExpectedPublicContracts[363]>
>;
type Contract_364_getLocationChangeInfo = Assert<
	Equal<Parameters<typeof Actual0.getLocationChangeInfo>['length'], ExpectedPublicContracts[364]>
>;
type Contract_365_RouterCore = Assert<
	Equal<keyof typeof Actual0.RouterCore, ExpectedPublicContracts[365]>
>;
type Contract_366_lazyFn = Assert<
	Equal<Parameters<typeof Actual0.lazyFn>['length'], ExpectedPublicContracts[366]>
>;
type Contract_367_SearchParamError = Assert<
	Equal<
		ConstructorParameters<typeof Actual0.SearchParamError>['length'],
		ExpectedPublicContracts[367]
	>
>;
type Contract_368_PathParamError = Assert<
	Equal<
		ConstructorParameters<typeof Actual0.PathParamError>['length'],
		ExpectedPublicContracts[368]
	>
>;
type Contract_369_getInitialRouterState = Assert<
	Equal<Parameters<typeof Actual0.getInitialRouterState>['length'], ExpectedPublicContracts[369]>
>;
type Contract_370_trailingSlashOptions = Assert<
	Equal<keyof typeof Actual0.trailingSlashOptions, ExpectedPublicContracts[370]>
>;
type Contract_371_ViewTransitionOptions = Assert<
	Equal<keyof Actual0.ViewTransitionOptions, ExpectedPublicContracts[371]>
>;
type Contract_372_TrailingSlashOption = Assert<
	Equal<Actual0.TrailingSlashOption, ExpectedPublicContracts[372]>
>;
type Contract_373_Register = Assert<Equal<keyof Actual0.Register, ExpectedPublicContracts[373]>>;
type Contract_374_AnyRouter = Assert<Equal<keyof Actual0.AnyRouter, ExpectedPublicContracts[374]>>;
type Contract_375_AnyRouterWithContext = Assert<
	Equal<keyof Actual0.AnyRouterWithContext<{ value: string }>, ExpectedPublicContracts[375]>
>;
type Contract_376_RegisteredRouter = Assert<
	Equal<keyof Actual0.RegisteredRouter, ExpectedPublicContracts[376]>
>;
type Contract_377_RouterState = Assert<
	Equal<keyof Actual0.RouterState, ExpectedPublicContracts[377]>
>;
type Contract_378_BuildNextOptions = Assert<
	Equal<keyof Actual0.BuildNextOptions, ExpectedPublicContracts[378]>
>;
type Contract_379_RouterListener = Assert<
	Equal<
		keyof Actual0.RouterListener<import('@tanstack/router-core').RouterEvent>,
		ExpectedPublicContracts[379]
	>
>;
type Contract_380_RouterEvent = Assert<
	Equal<keyof Actual0.RouterEvent, ExpectedPublicContracts[380]>
>;
type Contract_381_ListenerFn = Assert<
	Equal<
		keyof Actual0.ListenerFn<import('@tanstack/router-core').RouterEvent>,
		ExpectedPublicContracts[381]
	>
>;
type Contract_382_RouterEvents = Assert<
	Equal<keyof Actual0.RouterEvents, ExpectedPublicContracts[382]>
>;
type Contract_383_MatchRoutesOpts = Assert<
	Equal<keyof Actual0.MatchRoutesOpts, ExpectedPublicContracts[383]>
>;
type Contract_384_RouterOptionsExtensions = Assert<
	Equal<keyof Actual0.RouterOptionsExtensions, ExpectedPublicContracts[384]>
>;
type Contract_385_DefaultRemountDepsFn = Assert<
	Equal<keyof Actual0.DefaultRemountDepsFn<Actual0.RootRoute>, ExpectedPublicContracts[385]>
>;
type Contract_386_PreloadRouteFn = Assert<
	Equal<
		keyof Actual0.PreloadRouteFn<
			Actual0.RootRoute,
			'never',
			true,
			import('@tanstack/history').RouterHistory
		>,
		ExpectedPublicContracts[386]
	>
>;
type Contract_387_MatchRouteFn = Assert<
	Equal<
		keyof Actual0.MatchRouteFn<
			Actual0.RootRoute,
			'never',
			true,
			import('@tanstack/history').RouterHistory
		>,
		ExpectedPublicContracts[387]
	>
>;
type Contract_388_RouterContextOptions = Assert<
	Equal<keyof Actual0.RouterContextOptions<Actual0.RootRoute>, ExpectedPublicContracts[388]>
>;
type Contract_389_RouterOptions = Assert<
	Equal<keyof Actual0.RouterOptions<Actual0.RootRoute, 'never'>, ExpectedPublicContracts[389]>
>;
type Contract_390_RouterConstructorOptions = Assert<
	Equal<
		keyof Actual0.RouterConstructorOptions<
			Actual0.RootRoute,
			'never',
			true,
			import('@tanstack/history').RouterHistory,
			{ value: string }
		>,
		ExpectedPublicContracts[390]
	>
>;
type Contract_391_UpdateFn = Assert<
	Equal<
		keyof Actual0.UpdateFn<
			Actual0.RootRoute,
			'never',
			true,
			import('@tanstack/history').RouterHistory,
			{ value: string }
		>,
		ExpectedPublicContracts[391]
	>
>;
type Contract_392_ParseLocationFn = Assert<
	Equal<keyof Actual0.ParseLocationFn<Actual0.RootRoute>, ExpectedPublicContracts[392]>
>;
type Contract_393_InvalidateFn = Assert<
	Equal<
		keyof Actual0.InvalidateFn<import('@tanstack/router-core').AnyRouter>,
		ExpectedPublicContracts[393]
	>
>;
type Contract_394_ControllablePromise = Assert<
	Equal<keyof Actual0.ControllablePromise, ExpectedPublicContracts[394]>
>;
type Contract_395_InjectedHtmlEntry = Assert<
	Equal<keyof Actual0.InjectedHtmlEntry, ExpectedPublicContracts[395]>
>;
type Contract_396_EmitFn = Assert<Equal<keyof Actual0.EmitFn, ExpectedPublicContracts[396]>>;
type Contract_397_LoadFn = Assert<Equal<keyof Actual0.LoadFn, ExpectedPublicContracts[397]>>;
type Contract_398_SubscribeFn = Assert<
	Equal<keyof Actual0.SubscribeFn, ExpectedPublicContracts[398]>
>;
type Contract_399_CommitLocationFn = Assert<
	Equal<keyof Actual0.CommitLocationFn, ExpectedPublicContracts[399]>
>;
type Contract_400_GetMatchRoutesFn = Assert<
	Equal<keyof Actual0.GetMatchRoutesFn, ExpectedPublicContracts[400]>
>;
type Contract_401_MatchRoutesFn = Assert<
	Equal<keyof Actual0.MatchRoutesFn, ExpectedPublicContracts[401]>
>;
type Contract_402_StartTransitionFn = Assert<
	Equal<keyof Actual0.StartTransitionFn, ExpectedPublicContracts[402]>
>;
type Contract_403_LoadRouteChunkFn = Assert<
	Equal<keyof Actual0.LoadRouteChunkFn, ExpectedPublicContracts[403]>
>;
type Contract_404_ClearCacheFn = Assert<
	Equal<
		keyof Actual0.ClearCacheFn<import('@tanstack/router-core').AnyRouter>,
		ExpectedPublicContracts[404]
	>
>;
type Contract_405_CreateRouterFn = Assert<
	Equal<keyof Actual0.CreateRouterFn, ExpectedPublicContracts[405]>
>;
type Contract_406_SSROption = Assert<Equal<Actual0.SSROption, ExpectedPublicContracts[406]>>;
type Contract_407_MatchLocation = Assert<
	Equal<keyof Actual0.MatchLocation, ExpectedPublicContracts[407]>
>;
type Contract_408_CommitLocationOptions = Assert<
	Equal<keyof Actual0.CommitLocationOptions, ExpectedPublicContracts[408]>
>;
type Contract_409_NavigateFn = Assert<
	Equal<keyof Actual0.NavigateFn, ExpectedPublicContracts[409]>
>;
type Contract_410_BuildLocationFn = Assert<
	Equal<keyof Actual0.BuildLocationFn, ExpectedPublicContracts[410]>
>;
type Contract_411_retainSearchParams = Assert<
	Equal<Parameters<typeof Actual0.retainSearchParams>['length'], ExpectedPublicContracts[411]>
>;
type Contract_412_stripSearchParams = Assert<
	Equal<Parameters<typeof Actual0.stripSearchParams>['length'], ExpectedPublicContracts[412]>
>;
type Contract_413_defaultParseSearch = Assert<
	Equal<Parameters<typeof Actual0.defaultParseSearch>['length'], ExpectedPublicContracts[413]>
>;
type Contract_414_defaultStringifySearch = Assert<
	Equal<Parameters<typeof Actual0.defaultStringifySearch>['length'], ExpectedPublicContracts[414]>
>;
type Contract_415_parseSearchWith = Assert<
	Equal<Parameters<typeof Actual0.parseSearchWith>['length'], ExpectedPublicContracts[415]>
>;
type Contract_416_stringifySearchWith = Assert<
	Equal<Parameters<typeof Actual0.stringifySearchWith>['length'], ExpectedPublicContracts[416]>
>;
type Contract_417_SearchSerializer = Assert<
	Equal<keyof Actual0.SearchSerializer, ExpectedPublicContracts[417]>
>;
type Contract_418_SearchParser = Assert<
	Equal<keyof Actual0.SearchParser, ExpectedPublicContracts[418]>
>;
type Contract_419_OptionalStructuralSharing = Assert<
	Equal<
		keyof Actual0.OptionalStructuralSharing<{ value: string }, { value: string }>,
		ExpectedPublicContracts[419]
	>
>;
type Contract_420_functionalUpdate = Assert<
	Equal<Parameters<typeof Actual0.functionalUpdate>['length'], ExpectedPublicContracts[420]>
>;
type Contract_421_hasKeys = Assert<
	Equal<Parameters<typeof Actual0.hasKeys>['length'], ExpectedPublicContracts[421]>
>;
type Contract_422_replaceEqualDeep = Assert<
	Equal<Parameters<typeof Actual0.replaceEqualDeep>['length'], ExpectedPublicContracts[422]>
>;
type Contract_423_isPlainObject = Assert<
	Equal<Parameters<typeof Actual0.isPlainObject>['length'], ExpectedPublicContracts[423]>
>;
type Contract_424_isPlainArray = Assert<
	Equal<Parameters<typeof Actual0.isPlainArray>['length'], ExpectedPublicContracts[424]>
>;
type Contract_425_deepEqual = Assert<
	Equal<Parameters<typeof Actual0.deepEqual>['length'], ExpectedPublicContracts[425]>
>;
type Contract_426_createControlledPromise = Assert<
	Equal<Parameters<typeof Actual0.createControlledPromise>['length'], ExpectedPublicContracts[426]>
>;
type Contract_427_isModuleNotFoundError = Assert<
	Equal<Parameters<typeof Actual0.isModuleNotFoundError>['length'], ExpectedPublicContracts[427]>
>;
type Contract_428_DEFAULT_PROTOCOL_ALLOWLIST = Assert<
	Equal<keyof typeof Actual0.DEFAULT_PROTOCOL_ALLOWLIST, ExpectedPublicContracts[428]>
>;
type Contract_429_escapeHtml = Assert<
	Equal<Parameters<typeof Actual0.escapeHtml>['length'], ExpectedPublicContracts[429]>
>;
type Contract_430_getUrlScheme = Assert<
	Equal<Parameters<typeof Actual0.getUrlScheme>['length'], ExpectedPublicContracts[430]>
>;
type Contract_431_isDangerousProtocol = Assert<
	Equal<Parameters<typeof Actual0.isDangerousProtocol>['length'], ExpectedPublicContracts[431]>
>;
type Contract_432_buildDevStylesUrl = Assert<
	Equal<Parameters<typeof Actual0.buildDevStylesUrl>['length'], ExpectedPublicContracts[432]>
>;
type Contract_433_NoInfer = Assert<
	Equal<keyof Actual0.NoInfer<{ value: string }>, ExpectedPublicContracts[433]>
>;
type Contract_434_IsAny = Assert<
	Equal<keyof Actual0.IsAny<{ value: string }, { value: string }>, ExpectedPublicContracts[434]>
>;
type Contract_435_PickAsRequired = Assert<
	Equal<keyof Actual0.PickAsRequired<{ value: string }, 'value'>, ExpectedPublicContracts[435]>
>;
type Contract_436_PickRequired = Assert<
	Equal<keyof Actual0.PickRequired<{ value: string }>, ExpectedPublicContracts[436]>
>;
type Contract_437_PickOptional = Assert<
	Equal<keyof Actual0.PickOptional<{ value: string }>, ExpectedPublicContracts[437]>
>;
type Contract_438_WithoutEmpty = Assert<
	Equal<keyof Actual0.WithoutEmpty<{ value: string }>, ExpectedPublicContracts[438]>
>;
type Contract_439_Expand = Assert<
	Equal<keyof Actual0.Expand<{ value: string }>, ExpectedPublicContracts[439]>
>;
type Contract_440_DeepPartial = Assert<
	Equal<keyof Actual0.DeepPartial<{ value: string }>, ExpectedPublicContracts[440]>
>;
type Contract_441_MakeDifferenceOptional = Assert<
	Equal<
		keyof Actual0.MakeDifferenceOptional<{ value: string }, { value: string }>,
		ExpectedPublicContracts[441]
	>
>;
type Contract_442_IsUnion = Assert<
	Equal<Actual0.IsUnion<{ value: string }>, ExpectedPublicContracts[442]>
>;
type Contract_443_IsNonEmptyObject = Assert<
	Equal<Actual0.IsNonEmptyObject<{ value: string }>, ExpectedPublicContracts[443]>
>;
type Contract_444_Assign = Assert<
	Equal<keyof Actual0.Assign<{ value: string }, { value: string }>, ExpectedPublicContracts[444]>
>;
type Contract_445_IntersectAssign = Assert<
	Equal<
		keyof Actual0.IntersectAssign<{ value: string }, { value: string }>,
		ExpectedPublicContracts[445]
	>
>;
type Contract_446_Timeout = Assert<Equal<keyof Actual0.Timeout, ExpectedPublicContracts[446]>>;
type Contract_447_Updater = Assert<
	Equal<keyof Actual0.Updater<{ value: string }>, ExpectedPublicContracts[447]>
>;
type Contract_448_NonNullableUpdater = Assert<
	Equal<keyof Actual0.NonNullableUpdater<{ value: string }>, ExpectedPublicContracts[448]>
>;
type Contract_449_StringLiteral = Assert<
	Equal<Actual0.StringLiteral<{ value: string }>, ExpectedPublicContracts[449]>
>;
type Contract_450_ThrowOrOptional = Assert<
	Equal<keyof Actual0.ThrowOrOptional<{ value: string }, true>, ExpectedPublicContracts[450]>
>;
type Contract_451_ThrowConstraint = Assert<
	Equal<Actual0.ThrowConstraint<true, true>, ExpectedPublicContracts[451]>
>;
type Contract_452_ControlledPromise = Assert<
	Equal<keyof Actual0.ControlledPromise<{ value: string }>, ExpectedPublicContracts[452]>
>;
type Contract_453_ExtractObjects = Assert<
	Equal<keyof Actual0.ExtractObjects<{ value: string }>, ExpectedPublicContracts[453]>
>;
type Contract_454_PartialMergeAllObject = Assert<
	Equal<keyof Actual0.PartialMergeAllObject<{ value: string }>, ExpectedPublicContracts[454]>
>;
type Contract_455_MergeAllPrimitive = Assert<
	Equal<keyof Actual0.MergeAllPrimitive, ExpectedPublicContracts[455]>
>;
type Contract_456_ExtractPrimitives = Assert<
	Equal<Actual0.ExtractPrimitives<{ value: string }>, ExpectedPublicContracts[456]>
>;
type Contract_457_PartialMergeAll = Assert<
	Equal<keyof Actual0.PartialMergeAll<{ value: string }>, ExpectedPublicContracts[457]>
>;
type Contract_458_Constrain = Assert<
	Equal<keyof Actual0.Constrain<{ value: string }, { value: string }>, ExpectedPublicContracts[458]>
>;
type Contract_459_ConstrainLiteral = Assert<
	Equal<
		keyof Actual0.ConstrainLiteral<{ value: string }, { value: string }>,
		ExpectedPublicContracts[459]
	>
>;
type Contract_460_UnionToIntersection = Assert<
	Equal<keyof Actual0.UnionToIntersection<{ value: string }>, ExpectedPublicContracts[460]>
>;
type Contract_461_MergeAllObjects = Assert<
	Equal<keyof Actual0.MergeAllObjects<{ value: string }>, ExpectedPublicContracts[461]>
>;
type Contract_462_MergeAll = Assert<
	Equal<keyof Actual0.MergeAll<{ value: string }>, ExpectedPublicContracts[462]>
>;
type Contract_463_ValidateJSON = Assert<
	Equal<keyof Actual0.ValidateJSON<{ value: string }>, ExpectedPublicContracts[463]>
>;
type Contract_464_StrictOrFrom = Assert<
	Equal<
		keyof Actual0.StrictOrFrom<import('@tanstack/router-core').AnyRouter, '/example'>,
		ExpectedPublicContracts[464]
	>
>;
type Contract_465_LooseReturnType = Assert<
	Equal<Actual0.LooseReturnType<{ value: string }>, ExpectedPublicContracts[465]>
>;
type Contract_466_LooseAsyncReturnType = Assert<
	Equal<Actual0.LooseAsyncReturnType<{ value: string }>, ExpectedPublicContracts[466]>
>;
type Contract_467_Awaitable = Assert<
	Equal<keyof Actual0.Awaitable<{ value: string }>, ExpectedPublicContracts[467]>
>;
type Contract_468_StandardSchemaValidatorProps = Assert<
	Equal<
		keyof Actual0.StandardSchemaValidatorProps<{ value: string }, { value: string }>,
		ExpectedPublicContracts[468]
	>
>;
type Contract_469_StandardSchemaValidator = Assert<
	Equal<
		keyof Actual0.StandardSchemaValidator<{ value: string }, { value: string }>,
		ExpectedPublicContracts[469]
	>
>;
type Contract_470_AnyStandardSchemaValidator = Assert<
	Equal<keyof Actual0.AnyStandardSchemaValidator, ExpectedPublicContracts[470]>
>;
type Contract_471_StandardSchemaValidatorTypes = Assert<
	Equal<
		keyof Actual0.StandardSchemaValidatorTypes<{ value: string }, { value: string }>,
		ExpectedPublicContracts[471]
	>
>;
type Contract_472_AnyStandardSchemaValidateSuccess = Assert<
	Equal<keyof Actual0.AnyStandardSchemaValidateSuccess, ExpectedPublicContracts[472]>
>;
type Contract_473_AnyStandardSchemaValidateFailure = Assert<
	Equal<keyof Actual0.AnyStandardSchemaValidateFailure, ExpectedPublicContracts[473]>
>;
type Contract_474_AnyStandardSchemaValidateIssue = Assert<
	Equal<keyof Actual0.AnyStandardSchemaValidateIssue, ExpectedPublicContracts[474]>
>;
type Contract_475_AnyStandardSchemaValidateInput = Assert<
	Equal<keyof Actual0.AnyStandardSchemaValidateInput, ExpectedPublicContracts[475]>
>;
type Contract_476_AnyStandardSchemaValidate = Assert<
	Equal<keyof Actual0.AnyStandardSchemaValidate, ExpectedPublicContracts[476]>
>;
type Contract_477_ValidatorObj = Assert<
	Equal<
		keyof Actual0.ValidatorObj<{ value: string }, { value: string }>,
		ExpectedPublicContracts[477]
	>
>;
type Contract_478_AnyValidatorObj = Assert<
	Equal<keyof Actual0.AnyValidatorObj, ExpectedPublicContracts[478]>
>;
type Contract_479_ValidatorAdapter = Assert<
	Equal<
		keyof Actual0.ValidatorAdapter<{ value: string }, { value: string }>,
		ExpectedPublicContracts[479]
	>
>;
type Contract_480_AnyValidatorAdapter = Assert<
	Equal<keyof Actual0.AnyValidatorAdapter, ExpectedPublicContracts[480]>
>;
type Contract_481_AnyValidatorFn = Assert<
	Equal<keyof Actual0.AnyValidatorFn, ExpectedPublicContracts[481]>
>;
type Contract_482_ValidatorFn = Assert<
	Equal<
		keyof Actual0.ValidatorFn<{ value: string }, { value: string }>,
		ExpectedPublicContracts[482]
	>
>;
type Contract_483_Validator = Assert<
	Equal<keyof Actual0.Validator<{ value: string }, { value: string }>, ExpectedPublicContracts[483]>
>;
type Contract_484_AnyValidator = Assert<
	Equal<keyof Actual0.AnyValidator, ExpectedPublicContracts[484]>
>;
type Contract_485_AnySchema = Assert<Equal<keyof Actual0.AnySchema, ExpectedPublicContracts[485]>>;
type Contract_486_DefaultValidator = Assert<
	Equal<keyof Actual0.DefaultValidator, ExpectedPublicContracts[486]>
>;
type Contract_487_ResolveSearchValidatorInputFn = Assert<
	Equal<
		keyof Actual0.ResolveSearchValidatorInputFn<{ value: string }>,
		ExpectedPublicContracts[487]
	>
>;
type Contract_488_ResolveSearchValidatorInput = Assert<
	Equal<keyof Actual0.ResolveSearchValidatorInput<{ value: string }>, ExpectedPublicContracts[488]>
>;
type Contract_489_ResolveValidatorInputFn = Assert<
	Equal<Actual0.ResolveValidatorInputFn<{ value: string }>, ExpectedPublicContracts[489]>
>;
type Contract_490_ResolveValidatorInput = Assert<
	Equal<Actual0.ResolveValidatorInput<{ value: string }>, ExpectedPublicContracts[490]>
>;
type Contract_491_ResolveValidatorOutputFn = Assert<
	Equal<keyof Actual0.ResolveValidatorOutputFn<{ value: string }>, ExpectedPublicContracts[491]>
>;
type Contract_492_ResolveValidatorOutput = Assert<
	Equal<keyof Actual0.ResolveValidatorOutput<{ value: string }>, ExpectedPublicContracts[492]>
>;
type Contract_493_UseRouteContextBaseOptions = Assert<
	Equal<
		keyof Actual0.UseRouteContextBaseOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string }
		>,
		ExpectedPublicContracts[493]
	>
>;
type Contract_494_UseRouteContextOptions = Assert<
	Equal<
		keyof Actual0.UseRouteContextOptions<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string }
		>,
		ExpectedPublicContracts[494]
	>
>;
type Contract_495_UseRouteContextResult = Assert<
	Equal<
		keyof Actual0.UseRouteContextResult<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string }
		>,
		ExpectedPublicContracts[495]
	>
>;
type Contract_496_UseSearchResult = Assert<
	Equal<
		keyof Actual0.UseSearchResult<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string }
		>,
		ExpectedPublicContracts[496]
	>
>;
type Contract_497_ResolveUseSearch = Assert<
	Equal<
		keyof Actual0.ResolveUseSearch<import('@tanstack/router-core').AnyRouter, '/example', true>,
		ExpectedPublicContracts[497]
	>
>;
type Contract_498_UseParamsResult = Assert<
	Equal<
		keyof Actual0.UseParamsResult<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string }
		>,
		ExpectedPublicContracts[498]
	>
>;
type Contract_499_ResolveUseParams = Assert<
	Equal<
		keyof Actual0.ResolveUseParams<import('@tanstack/router-core').AnyRouter, '/example', true>,
		ExpectedPublicContracts[499]
	>
>;
type Contract_500_UseNavigateResult = Assert<
	Equal<keyof Actual0.UseNavigateResult<'/example'>, ExpectedPublicContracts[500]>
>;
type Contract_501_UseLoaderDepsResult = Assert<
	Equal<
		keyof Actual0.UseLoaderDepsResult<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			{ value: string }
		>,
		ExpectedPublicContracts[501]
	>
>;
type Contract_502_ResolveUseLoaderDeps = Assert<
	Equal<
		keyof Actual0.ResolveUseLoaderDeps<import('@tanstack/router-core').AnyRouter, '/example'>,
		ExpectedPublicContracts[502]
	>
>;
type Contract_503_UseLoaderDataResult = Assert<
	Equal<
		keyof Actual0.UseLoaderDataResult<
			import('@tanstack/router-core').AnyRouter,
			'/example',
			true,
			{ value: string }
		>,
		ExpectedPublicContracts[503]
	>
>;
type Contract_504_ResolveUseLoaderData = Assert<
	Equal<
		keyof Actual0.ResolveUseLoaderData<import('@tanstack/router-core').AnyRouter, '/example', true>,
		ExpectedPublicContracts[504]
	>
>;
type Contract_505_Redirect = Assert<Equal<keyof Actual0.Redirect, ExpectedPublicContracts[505]>>;
type Contract_506_RedirectOptions = Assert<
	Equal<keyof Actual0.RedirectOptions, ExpectedPublicContracts[506]>
>;
type Contract_507_RedirectOptionsRoute = Assert<
	Equal<keyof Actual0.RedirectOptionsRoute, ExpectedPublicContracts[507]>
>;
type Contract_508_RedirectFnRoute = Assert<
	Equal<keyof Actual0.RedirectFnRoute, ExpectedPublicContracts[508]>
>;
type Contract_509_ResolvedRedirect = Assert<
	Equal<keyof Actual0.ResolvedRedirect, ExpectedPublicContracts[509]>
>;
type Contract_510_AnyRedirect = Assert<
	Equal<keyof Actual0.AnyRedirect, ExpectedPublicContracts[510]>
>;
type Contract_511_redirect = Assert<
	Equal<Parameters<typeof Actual0.redirect>['length'], ExpectedPublicContracts[511]>
>;
type Contract_512_isRedirect = Assert<
	Equal<Parameters<typeof Actual0.isRedirect>['length'], ExpectedPublicContracts[512]>
>;
type Contract_513_isResolvedRedirect = Assert<
	Equal<Parameters<typeof Actual0.isResolvedRedirect>['length'], ExpectedPublicContracts[513]>
>;
type Contract_514_parseRedirect = Assert<
	Equal<Parameters<typeof Actual0.parseRedirect>['length'], ExpectedPublicContracts[514]>
>;
type Contract_515_NotFoundError = Assert<
	Equal<keyof Actual0.NotFoundError, ExpectedPublicContracts[515]>
>;
type Contract_516_isNotFound = Assert<
	Equal<Parameters<typeof Actual0.isNotFound>['length'], ExpectedPublicContracts[516]>
>;
type Contract_517_notFound = Assert<
	Equal<Parameters<typeof Actual0.notFound>['length'], ExpectedPublicContracts[517]>
>;
type Contract_518_defaultGetScrollRestorationKey = Assert<
	Equal<
		Parameters<typeof Actual0.defaultGetScrollRestorationKey>['length'],
		ExpectedPublicContracts[518]
	>
>;
type Contract_519_getElementScrollRestorationEntry = Assert<
	Equal<
		Parameters<typeof Actual0.getElementScrollRestorationEntry>['length'],
		ExpectedPublicContracts[519]
	>
>;
type Contract_520_storageKey = Assert<
	Equal<keyof typeof Actual0.storageKey, ExpectedPublicContracts[520]>
>;
type Contract_521_setupScrollRestoration = Assert<
	Equal<Parameters<typeof Actual0.setupScrollRestoration>['length'], ExpectedPublicContracts[521]>
>;
type Contract_522_ScrollRestorationOptions = Assert<
	Equal<keyof Actual0.ScrollRestorationOptions, ExpectedPublicContracts[522]>
>;
type Contract_523_ScrollRestorationEntry = Assert<
	Equal<keyof Actual0.ScrollRestorationEntry, ExpectedPublicContracts[523]>
>;
type Contract_524_ValidateFromPath = Assert<
	Equal<Actual0.ValidateFromPath, ExpectedPublicContracts[524]>
>;
type Contract_525_ValidateToPath = Assert<
	Equal<keyof Actual0.ValidateToPath, ExpectedPublicContracts[525]>
>;
type Contract_526_ValidateSearch = Assert<
	Equal<keyof Actual0.ValidateSearch, ExpectedPublicContracts[526]>
>;
type Contract_527_ValidateParams = Assert<
	Equal<keyof Actual0.ValidateParams, ExpectedPublicContracts[527]>
>;
type Contract_528_InferFrom = Assert<
	Equal<Actual0.InferFrom<{ value: string }>, ExpectedPublicContracts[528]>
>;
type Contract_529_InferTo = Assert<
	Equal<Actual0.InferTo<{ value: string }>, ExpectedPublicContracts[529]>
>;
type Contract_530_InferMaskTo = Assert<
	Equal<Actual0.InferMaskTo<{ value: string }>, ExpectedPublicContracts[530]>
>;
type Contract_531_InferMaskFrom = Assert<
	Equal<Actual0.InferMaskFrom<{ value: string }>, ExpectedPublicContracts[531]>
>;
type Contract_532_ValidateNavigateOptions = Assert<
	Equal<keyof Actual0.ValidateNavigateOptions, ExpectedPublicContracts[532]>
>;
type Contract_533_ValidateNavigateOptionsArray = Assert<
	Equal<keyof Actual0.ValidateNavigateOptionsArray, ExpectedPublicContracts[533]>
>;
type Contract_534_ValidateRedirectOptions = Assert<
	Equal<keyof Actual0.ValidateRedirectOptions, ExpectedPublicContracts[534]>
>;
type Contract_535_ValidateRedirectOptionsArray = Assert<
	Equal<keyof Actual0.ValidateRedirectOptionsArray, ExpectedPublicContracts[535]>
>;
type Contract_536_ValidateId = Assert<
	Equal<keyof Actual0.ValidateId, ExpectedPublicContracts[536]>
>;
type Contract_537_InferStrict = Assert<
	Equal<Actual0.InferStrict<{ value: string }>, ExpectedPublicContracts[537]>
>;
type Contract_538_InferShouldThrow = Assert<
	Equal<Actual0.InferShouldThrow<{ value: string }>, ExpectedPublicContracts[538]>
>;
type Contract_539_InferSelected = Assert<
	Equal<keyof Actual0.InferSelected<{ value: string }>, ExpectedPublicContracts[539]>
>;
type Contract_540_ValidateUseSearchResult = Assert<
	Equal<keyof Actual0.ValidateUseSearchResult<{ value: string }>, ExpectedPublicContracts[540]>
>;
type Contract_541_ValidateUseParamsResult = Assert<
	Equal<keyof Actual0.ValidateUseParamsResult<{ value: string }>, ExpectedPublicContracts[541]>
>;
type Contract_542_AnySerializationAdapter = Assert<
	Equal<keyof Actual0.AnySerializationAdapter, ExpectedPublicContracts[542]>
>;
type Contract_543_SerializationAdapter = Assert<
	Equal<
		keyof Actual0.SerializationAdapter<{ value: string }, { value: string }, []>,
		ExpectedPublicContracts[543]
	>
>;
type Contract_544_ValidateSerializableInput = Assert<
	Equal<
		keyof Actual0.ValidateSerializableInput<{}, { value: string }>,
		ExpectedPublicContracts[544]
	>
>;
type Contract_545_SerializerExtensions = Assert<
	Equal<keyof Actual0.SerializerExtensions, ExpectedPublicContracts[545]>
>;
type Contract_546_ValidateSerializable = Assert<
	Equal<
		keyof Actual0.ValidateSerializable<{ value: string }, { value: string }>,
		ExpectedPublicContracts[546]
	>
>;
type Contract_547_RegisteredSerializableInput = Assert<
	Equal<keyof Actual0.RegisteredSerializableInput<{}>, ExpectedPublicContracts[547]>
>;
type Contract_548_SerializableExtensions = Assert<
	Equal<keyof Actual0.SerializableExtensions, ExpectedPublicContracts[548]>
>;
type Contract_549_DefaultSerializable = Assert<
	Equal<keyof Actual0.DefaultSerializable, ExpectedPublicContracts[549]>
>;
type Contract_550_Serializable = Assert<
	Equal<keyof Actual0.Serializable, ExpectedPublicContracts[550]>
>;
type Contract_551_TSR_SERIALIZABLE = Assert<
	Equal<Actual0.TSR_SERIALIZABLE, ExpectedPublicContracts[551]>
>;
type Contract_552_TsrSerializable = Assert<
	Equal<keyof Actual0.TsrSerializable, ExpectedPublicContracts[552]>
>;
type Contract_553_SerializationError = Assert<
	Equal<keyof Actual0.SerializationError<'/example'>, ExpectedPublicContracts[553]>
>;
type Contract_554_createSerializationAdapter = Assert<
	Equal<
		Parameters<typeof Actual0.createSerializationAdapter>['length'],
		ExpectedPublicContracts[554]
	>
>;
type Contract_555_makeSerovalPlugin = Assert<
	Equal<Parameters<typeof Actual0.makeSerovalPlugin>['length'], ExpectedPublicContracts[555]>
>;
type Contract_556_makeSsrSerovalPlugin = Assert<
	Equal<Parameters<typeof Actual0.makeSsrSerovalPlugin>['length'], ExpectedPublicContracts[556]>
>;
type Contract_557_defaultSerovalPlugins = Assert<
	Equal<keyof typeof Actual0.defaultSerovalPlugins, ExpectedPublicContracts[557]>
>;
type Contract_558_RawStream = Assert<
	Equal<ConstructorParameters<typeof Actual0.RawStream>['length'], ExpectedPublicContracts[558]>
>;
type Contract_559_createRawStreamRPCPlugin = Assert<
	Equal<Parameters<typeof Actual0.createRawStreamRPCPlugin>['length'], ExpectedPublicContracts[559]>
>;
type Contract_560_createRawStreamDeserializePlugin = Assert<
	Equal<
		Parameters<typeof Actual0.createRawStreamDeserializePlugin>['length'],
		ExpectedPublicContracts[560]
	>
>;
type Contract_561_OnRawStreamCallback = Assert<
	Equal<keyof Actual0.OnRawStreamCallback, ExpectedPublicContracts[561]>
>;
type Contract_562_RawStreamHint = Assert<
	Equal<Actual0.RawStreamHint, ExpectedPublicContracts[562]>
>;
type Contract_563_RawStreamOptions = Assert<
	Equal<keyof Actual0.RawStreamOptions, ExpectedPublicContracts[563]>
>;
type Contract_564_composeRewrites = Assert<
	Equal<Parameters<typeof Actual0.composeRewrites>['length'], ExpectedPublicContracts[564]>
>;
type Contract_565_executeRewriteInput = Assert<
	Equal<Parameters<typeof Actual0.executeRewriteInput>['length'], ExpectedPublicContracts[565]>
>;
type Contract_566_LocationRewrite = Assert<
	Equal<keyof Actual0.LocationRewrite, ExpectedPublicContracts[566]>
>;
type Contract_567_LocationRewriteFunction = Assert<
	Equal<keyof Actual0.LocationRewriteFunction, ExpectedPublicContracts[567]>
>;
type Contract_568_RouterConfigOptions = Assert<
	Equal<
		keyof Actual0.RouterConfigOptions<{ value: string }, { value: string }>,
		ExpectedPublicContracts[568]
	>
>;
type Contract_569_RouterConfig = Assert<
	Equal<
		keyof Actual0.RouterConfig<{ value: string }, { value: string }>,
		ExpectedPublicContracts[569]
	>
>;
type Contract_570_RouterConfigTypes = Assert<
	Equal<
		keyof Actual0.RouterConfigTypes<{ value: string }, { value: string }>,
		ExpectedPublicContracts[570]
	>
>;
type Contract_571_createRouterConfig = Assert<
	Equal<Parameters<typeof Actual0.createRouterConfig>['length'], ExpectedPublicContracts[571]>
>;
type Contract_572_AnyRouterConfig = Assert<
	Equal<keyof Actual0.AnyRouterConfig, ExpectedPublicContracts[572]>
>;
type Contract_573_createHistory = Assert<
	Equal<Parameters<typeof Actual1.createHistory>['length'], ExpectedPublicContracts[573]>
>;
type Contract_574_createBrowserHistory = Assert<
	Equal<Parameters<typeof Actual1.createBrowserHistory>['length'], ExpectedPublicContracts[574]>
>;
type Contract_575_createHashHistory = Assert<
	Equal<Parameters<typeof Actual1.createHashHistory>['length'], ExpectedPublicContracts[575]>
>;
type Contract_576_createMemoryHistory = Assert<
	Equal<Parameters<typeof Actual1.createMemoryHistory>['length'], ExpectedPublicContracts[576]>
>;
type Contract_577_normalizeProtocolRelative = Assert<
	Equal<
		Parameters<typeof Actual1.normalizeProtocolRelative>['length'],
		ExpectedPublicContracts[577]
	>
>;
type Contract_578_parseHref = Assert<
	Equal<Parameters<typeof Actual1.parseHref>['length'], ExpectedPublicContracts[578]>
>;
type Contract_579_NavigateOptions = Assert<
	Equal<keyof Actual1.NavigateOptions, ExpectedPublicContracts[579]>
>;
type Contract_580_RouterHistory = Assert<
	Equal<keyof Actual1.RouterHistory, ExpectedPublicContracts[580]>
>;
type Contract_581_HistoryLocation = Assert<
	Equal<keyof Actual1.HistoryLocation, ExpectedPublicContracts[581]>
>;
type Contract_582_ParsedPath = Assert<
	Equal<keyof Actual1.ParsedPath, ExpectedPublicContracts[582]>
>;
type Contract_583_HistoryState = Assert<
	Equal<keyof Actual1.HistoryState, ExpectedPublicContracts[583]>
>;
type Contract_584_ParsedHistoryState = Assert<
	Equal<keyof Actual1.ParsedHistoryState, ExpectedPublicContracts[584]>
>;
type Contract_585_HistoryAction = Assert<
	Equal<Actual1.HistoryAction, ExpectedPublicContracts[585]>
>;
type Contract_586_BlockerFnArgs = Assert<
	Equal<keyof Actual1.BlockerFnArgs, ExpectedPublicContracts[586]>
>;
type Contract_587_BlockerFn = Assert<Equal<keyof Actual1.BlockerFn, ExpectedPublicContracts[587]>>;
type Contract_588_NavigationBlocker = Assert<
	Equal<keyof Actual1.NavigationBlocker, ExpectedPublicContracts[588]>
>;
type Contract_589_RouterServer = Assert<
	Equal<Parameters<typeof Actual2.RouterServer>['length'], ExpectedPublicContracts[589]>
>;
type Contract_590_defaultRenderHandler = Assert<
	Equal<Parameters<typeof Actual2.defaultRenderHandler>['length'], ExpectedPublicContracts[590]>
>;
type Contract_591_defaultStreamHandler = Assert<
	Equal<Parameters<typeof Actual2.defaultStreamHandler>['length'], ExpectedPublicContracts[591]>
>;
type Contract_592_renderRouterToStream = Assert<
	Equal<Parameters<typeof Actual2.renderRouterToStream>['length'], ExpectedPublicContracts[592]>
>;
type Contract_593_renderRouterToString = Assert<
	Equal<Parameters<typeof Actual2.renderRouterToString>['length'], ExpectedPublicContracts[593]>
>;
type Contract_594_createRequestHandler = Assert<
	Equal<Parameters<typeof Actual2.createRequestHandler>['length'], ExpectedPublicContracts[594]>
>;
type Contract_595_waitForRequest = Assert<
	Equal<Parameters<typeof Actual2.waitForRequest>['length'], ExpectedPublicContracts[595]>
>;
type Contract_596_RequestHandler = Assert<
	Equal<
		keyof Actual2.RequestHandler<import('@tanstack/router-core').AnyRouter>,
		ExpectedPublicContracts[596]
	>
>;
type Contract_597_bindSsrResponseToRequest = Assert<
	Equal<Parameters<typeof Actual2.bindSsrResponseToRequest>['length'], ExpectedPublicContracts[597]>
>;
type Contract_598_createSsrStreamResponse = Assert<
	Equal<Parameters<typeof Actual2.createSsrStreamResponse>['length'], ExpectedPublicContracts[598]>
>;
type Contract_599_defineHandlerCallback = Assert<
	Equal<Parameters<typeof Actual2.defineHandlerCallback>['length'], ExpectedPublicContracts[599]>
>;
type Contract_600_disposeSsrResponse = Assert<
	Equal<Parameters<typeof Actual2.disposeSsrResponse>['length'], ExpectedPublicContracts[600]>
>;
type Contract_601_disposeSsrResponseDetached = Assert<
	Equal<
		Parameters<typeof Actual2.disposeSsrResponseDetached>['length'],
		ExpectedPublicContracts[601]
	>
>;
type Contract_602_isSsrResponse = Assert<
	Equal<Parameters<typeof Actual2.isSsrResponse>['length'], ExpectedPublicContracts[602]>
>;
type Contract_603_normalizeSsrResponse = Assert<
	Equal<Parameters<typeof Actual2.normalizeSsrResponse>['length'], ExpectedPublicContracts[603]>
>;
type Contract_604_replaceSsrResponse = Assert<
	Equal<Parameters<typeof Actual2.replaceSsrResponse>['length'], ExpectedPublicContracts[604]>
>;
type Contract_605_stripSsrResponseBody = Assert<
	Equal<Parameters<typeof Actual2.stripSsrResponseBody>['length'], ExpectedPublicContracts[605]>
>;
type Contract_606_HandlerCallback = Assert<
	Equal<
		keyof Actual2.HandlerCallback<import('@tanstack/router-core').AnyRouter>,
		ExpectedPublicContracts[606]
	>
>;
type Contract_607_HandlerCallbackResult = Assert<
	Equal<keyof Actual2.HandlerCallbackResult, ExpectedPublicContracts[607]>
>;
type Contract_608_SsrResponse = Assert<
	Equal<keyof Actual2.SsrResponse, ExpectedPublicContracts[608]>
>;
type Contract_609_transformPipeableStreamWithRouter = Assert<
	Equal<
		Parameters<typeof Actual2.transformPipeableStreamWithRouter>['length'],
		ExpectedPublicContracts[609]
	>
>;
type Contract_610_transformStreamWithRouter = Assert<
	Equal<
		Parameters<typeof Actual2.transformStreamWithRouter>['length'],
		ExpectedPublicContracts[610]
	>
>;
type Contract_611_transformReadableStreamWithRouter = Assert<
	Equal<
		Parameters<typeof Actual2.transformReadableStreamWithRouter>['length'],
		ExpectedPublicContracts[611]
	>
>;
type Contract_612_TransformStreamWithRouterOptions = Assert<
	Equal<keyof Actual2.TransformStreamWithRouterOptions, ExpectedPublicContracts[612]>
>;
type Contract_613_attachRouterServerSsrUtils = Assert<
	Equal<
		Parameters<typeof Actual2.attachRouterServerSsrUtils>['length'],
		ExpectedPublicContracts[613]
	>
>;
type Contract_614_getNormalizedURL = Assert<
	Equal<Parameters<typeof Actual2.getNormalizedURL>['length'], ExpectedPublicContracts[614]>
>;
type Contract_615_getOrigin = Assert<
	Equal<Parameters<typeof Actual2.getOrigin>['length'], ExpectedPublicContracts[615]>
>;
type Contract_616_RouterClient = Assert<
	Equal<Parameters<typeof Actual3.RouterClient>['length'], ExpectedPublicContracts[616]>
>;
type Contract_617_mergeHeaders = Assert<
	Equal<Parameters<typeof Actual3.mergeHeaders>['length'], ExpectedPublicContracts[617]>
>;
type Contract_618_json = Assert<
	Equal<Parameters<typeof Actual3.json>['length'], ExpectedPublicContracts[618]>
>;
type Contract_619_JsonResponse = Assert<
	Equal<keyof Actual3.JsonResponse<{ value: string }>, ExpectedPublicContracts[619]>
>;
type Contract_620_hydrate = Assert<
	Equal<Parameters<typeof Actual3.hydrate>['length'], ExpectedPublicContracts[620]>
>;
type Contract_621_TsrSsrGlobal = Assert<
	Equal<keyof Actual3.TsrSsrGlobal, ExpectedPublicContracts[621]>
>;
type Contract_622_DehydratedMatch = Assert<
	Equal<keyof Actual3.DehydratedMatch, ExpectedPublicContracts[622]>
>;
type Contract_623_DehydratedRouter = Assert<
	Equal<keyof Actual3.DehydratedRouter, ExpectedPublicContracts[623]>
>;
type Contract_624_maskOctaneRouteSource = Assert<
	Equal<Parameters<typeof Actual4.maskOctaneRouteSource>['length'], ExpectedPublicContracts[624]>
>;
type Contract_625_octaneRouteGeneratorPlugin = Assert<
	Equal<
		Parameters<typeof Actual4.octaneRouteGeneratorPlugin>['length'],
		ExpectedPublicContracts[625]
	>
>;
type Contract_626_TransformRouteSourceOptions = Assert<
	Equal<keyof Actual4.TransformRouteSourceOptions, ExpectedPublicContracts[626]>
>;
type Contract_627_FormatRouteOptions = Assert<
	Equal<keyof Actual4.FormatRouteOptions, ExpectedPublicContracts[627]>
>;
type Contract_628_OctaneRouteGeneratorPlugin = Assert<
	Equal<keyof Actual4.OctaneRouteGeneratorPlugin, ExpectedPublicContracts[628]>
>;
