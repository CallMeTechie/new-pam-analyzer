import { createContext, type ReactNode, useContext } from 'react';
import { useUser } from './auth';

/**
 * Which company the current page shows.
 * - Company members always see their own company.
 * - Service staff see all companies, or one company "as the company sees it" under
 *   `/companies/:id/view/…` (company view).
 */
export interface Scope {
  /** `staff` shows the admin navigation, `company` the company navigation. */
  mode: 'staff' | 'company';
  /** Company filter for API calls; `null` = all companies (service staff only). */
  companyId: number | null;
  companyName: string | null;
  /** Service staff looking at a company view. */
  viewing: boolean;
  /** May manage users and API keys of `companyId`. */
  canManage: boolean;
  /** Link inside the current scope, e.g. `link('/results')`. */
  link(path: string): string;
}

const ScopeContext = createContext<Scope | null>(null);

export function ScopeProvider({
  viewCompany,
  children,
}: {
  viewCompany?: { id: number; name: string } | undefined;
  children: ReactNode;
}) {
  const user = useUser();
  const isAdmin = user.role === 'admin' && user.company.isService;
  let scope: Scope;
  if (viewCompany) {
    const base = `/companies/${viewCompany.id}/view`;
    scope = {
      mode: 'company',
      companyId: viewCompany.id,
      companyName: viewCompany.name,
      viewing: true,
      canManage: isAdmin,
      link: (path) => (path === '/' ? base : base + path),
    };
  } else if (user.company.isService) {
    scope = { mode: 'staff', companyId: null, companyName: null, viewing: false, canManage: isAdmin, link: (p) => p };
  } else {
    scope = {
      mode: 'company',
      companyId: user.company.id,
      companyName: user.company.name,
      viewing: false,
      canManage: user.role === 'companyAdmin',
      link: (p) => p,
    };
  }
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

export function useScope(): Scope {
  const value = useContext(ScopeContext);
  if (!value) throw new Error('useScope outside ScopeProvider');
  return value;
}
