import { createContext as createDomContext } from 'octane';
import { createContext as createNativeContext } from 'octane/universal/native';

export const ImportedDomContext = createDomContext('default');
export const ImportedNativeContext = createNativeContext('default');
