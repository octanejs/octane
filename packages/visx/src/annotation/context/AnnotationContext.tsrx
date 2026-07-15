import { createContext } from 'octane';
import type { AnnotationContextType } from '../types';

const AnnotationContext = createContext<AnnotationContextType>({});

export default AnnotationContext
