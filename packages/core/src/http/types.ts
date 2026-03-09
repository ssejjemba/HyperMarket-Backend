export type RouteAccess = 'public' | 'auth' | 'auth+tenant';

export type AuthContext = {
  userId?: string;
};

export type TenantContext = {
  tenantId?: string;
};

export type RequestAuthState = {
  auth?: AuthContext | undefined;
  tenant?: TenantContext | undefined;
};

export type HeaderMap = Record<string, string | string[] | undefined>;

export type RequestLike = {
  headers: HeaderMap;
} & RequestAuthState;
