import * as React from 'react';

/**
 * Serializable React-owned navigation state consumed by the hosted Octane
 * island through the public foreign-context bridge.
 */
export const Web3HostContext = React.createContext('portfolio');
