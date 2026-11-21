import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { CATALOGS, type MessageKey, useI18n } from '../i18n';
import { api, type Profile } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { useScope } from '../lib/scope';
import { Icon, type IconName, Logo } from './Icon';
import { CompanyBadge, InfoTip } from './ui';

interface NavItem {
  to: string;
  label: MessageKey;
  icon: IconName;
  end?: boolean;
}

function useNav(): { label: MessageKey; items: NavItem[] }[] {
  const scope = useScope();
  const user = useUser();
  const l = scope.link;
  if (scope.mode === 'company') {
    const sections: { label: MessageKey; items: NavItem[] }[] = [
      {
        label: 'nav.overview',
        items: [
          { to: l('/'), label: 'nav.dashboard', icon: 'dashboard', end: true },
          { to: l('/results'), label: 'nav.results', icon: 'results' },
        ],
      },
      { label: 'nav.data', items: [{ to: l('/upload'), label: 'nav.upload', icon: 'upload' }] },
    ];
    if (scope.canManage || scope.viewing) {
      sections.push({ label: 'nav.myCompany', items: [{ to: l('/team'), label: 'nav.team', icon: 'users' }] });
    }
    return sections;
  }
  const admin = user.role === 'admin';
  return [
    {
      label: 'nav.overview',
      items: [
        { to: '/', label: 'nav.dashboard', icon: 'dashboard', end: true },
        { to: '/results', label: 'nav.results', icon: 'results' },
      ],
    },
    { label: 'nav.data', items: [{ to: '/upload', label: 'nav.upload', icon: 'upload' }] },
    {
      label: 'nav.admin',
      items: [
        { to: '/companies', label: 'nav.companies', icon: 'companies' },
        ...(admin || user.role === 'companyAdmin'
          ? [{ to: '/users', label: 'nav.users', icon: 'users' } as NavItem]
          : []),
        ...(admin ? [{ to: '/settings', label: 'nav.settings', icon: 'settings' } as NavItem] : []),
      ],
    },
  ];
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

function ProfileMenu() {
  const { t } = useI18n();
  const user = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="profile" ref={ref}>
      {open && (
        <div className="menu" role="menu">
          <Link to="/account" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="lock" size={16} />
            {t('profile.account')}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <Icon name="logout" size={16} />
            {t('profile.logout')}
          </button>
        </div>
      )}
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="avatar">{initials(user.name)}</span>
        <span className="who">
          <b>{user.name}</b>
          <span>
            {user.company.name} · {t(`role.${user.role}`)}
          </span>
        </span>
        <span aria-hidden="true" className="muted" style={{ fontWeight: 700, letterSpacing: 1 }}>
          ···
        </span>
      </button>
    </div>
  );
}

/** Language choice; signed-in users keep it in their profile, so it applies on every device. */
/** "Made with ♥ by CallMeTechie" – in the footer and on the sign-in page. */
export function Credit() {
  const { t } = useI18n();
  return (
    <a className="credit" href="https://www.linkedin.com/in/ma-backes/" target="_blank" rel="noreferrer">
      {t('credit.madeWith')}
      <span className="heart" role="img" aria-label={t('credit.love')}>
        ♥
      </span>
      {t('credit.by')} CallMeTechie
    </a>
  );
}

export function LanguageSwitch() {
  const { t, locale, setLocale } = useI18n();
  const { user, setUser } = useAuth();
  async function change(next: string) {
    setLocale(next);
    if (!user) return;
    try {
      const res = await api.patch<{ user: Profile }>('/auth/me', { locale: next });
      setUser(res.user);
    } catch {
      // the language still changes for this session
    }
  }
  return (
    <label className="lang-switch">
      <Icon name="globe" size={16} />
      <span className="sr-only">{t('app.language')}</span>
      <select value={locale} onChange={(e) => void change(e.target.value)}>
        {Object.entries(CATALOGS).map(([code, c]) => (
          <option key={code} value={code}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout() {
  const { t } = useI18n();
  const scope = useScope();
  const sections = useNav();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className="app">
      <div className={`scrim${navOpen ? ' open' : ''}`} onClick={() => setNavOpen(false)} aria-hidden="true" />
      <div className="sidebar-col">
        <aside className={`sidebar${navOpen ? ' open' : ''}`} id="sidebar">
          <Link to={scope.link('/')} className="brand">
            <Logo />
            <span>
              <b>PAM Analyzer</b>
              <small>FUJI NXT · NXT-R · AIMEX</small>
            </span>
          </Link>
          {scope.mode === 'company' && scope.companyId !== null && (
            <div className="sidebar-company">
              <CompanyBadge
                company={{ id: scope.companyId, name: scope.companyName ?? '', logoVersion: scope.companyLogoVersion }}
                size={34}
              />
              <span>{scope.companyName}</span>
            </div>
          )}
          <nav className="nav" aria-label={t('nav.label')}>
            {sections.map((s) => (
              <div className="nav-section" key={s.label}>
                <span>{t(s.label)}</span>
                {s.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end ?? false}>
                    <Icon name={item.icon} />
                    <span>{t(item.label)}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <ProfileMenu />
        </aside>
      </div>
      <div className="main">
        {scope.viewing && (
          <div className="service-banner" role="status">
            <Icon name="eye" />
            <span>{t('banner.viewing', { company: scope.companyName ?? '' })}</span>
            <Link to={`/companies?selected=${scope.companyId}`}>← {t('banner.back')}</Link>
          </div>
        )}
        <MenuContext.Provider value={() => setNavOpen(true)}>
          <Outlet />
        </MenuContext.Provider>
        <footer className="footer">
          <LanguageSwitch />
          <Credit />
          <span className="version">v{__APP_VERSION__}</span>
        </footer>
      </div>
    </div>
  );
}

const MenuContext = createContext<() => void>(() => {});

/**
 * Extra controls of a page, set by the apps: back to the previous page, or close and enlarge when
 * the page is shown as a side panel.
 */
export interface PageChrome {
  back?: () => void;
  close?: () => void;
  expand?: () => void;
}
export const PageChromeContext = createContext<PageChrome>({});

/** Top bar with title and actions, followed by the page content. */
export function Page({
  title,
  info,
  actions,
  children,
}: {
  title: string;
  /** Explanation behind an (i) icon next to the title. */
  info?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const openMenu = useContext(MenuContext);
  const chrome = useContext(PageChromeContext);
  useEffect(() => {
    document.title = `${title} · PAM Analyzer`;
  }, [title]);
  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="btn icon ghost menu-toggle"
          aria-label={t('nav.open')}
          aria-controls="sidebar"
          onClick={openMenu}
        >
          <Icon name="menu" />
        </button>
        {chrome.back && (
          <button type="button" className="btn page-back" onClick={chrome.back}>
            <Icon name="arrowLeft" size={16} />
            <span className="label-sm-hide">{t('common.back')}</span>
          </button>
        )}
        {chrome.close && (
          <button
            type="button"
            className="btn icon ghost page-close"
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={chrome.close}
          >
            <Icon name="close" size={16} />
          </button>
        )}
        <h1 className="title-with-info">
          {title}
          {info && <InfoTip text={info} />}
        </h1>
        {actions}
        {chrome.expand && (
          <button
            type="button"
            className="btn icon"
            aria-label={t('common.expand')}
            title={t('common.expand')}
            onClick={chrome.expand}
          >
            <Icon name="expand" size={16} />
          </button>
        )}
      </header>
      <main className="content">{children}</main>
    </>
  );
}
