import { useContext } from 'octane';
import { useRouter, matchContext } from './context';
import { createRouterHooks } from './hookBindings';

export const {
	useMatch,
	useParams,
	useSearch,
	useLoaderData,
	useLoaderDeps,
	useRouteContext,
	useLocation,
	useMatches,
	useParentMatches,
	useChildMatches,
	useNavigate,
	useCanGoBack,
} = createRouterHooks(useRouter, () => useContext(matchContext));
