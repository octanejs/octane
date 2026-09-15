export interface UserNetworkReturnValue {
    online: boolean;
    downlink?: number;
    downlinkMax?: number;
    effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
    rtt?: number;
    saveData?: boolean;
    type?: 'bluetooth' | 'cellular' | 'ethernet' | 'wifi' | 'wimax' | 'none' | 'other' | 'unknown';
}
export declare function useNetwork(): UserNetworkReturnValue;
export declare namespace useNetwork {
    type ReturnValue = UserNetworkReturnValue;
}
