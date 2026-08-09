import { Page } from '@inertiajs/core';
import { createContext } from 'octane';

const pageContext = createContext<Page | null>(null);
export default pageContext;
