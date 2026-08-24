import { createContext } from 'octane';
import type { Client } from '@solana/kit';
import type { ClientStore } from './client-store';

export const ClientContext = createContext<ClientStore<Client<object>> | null>(null);
