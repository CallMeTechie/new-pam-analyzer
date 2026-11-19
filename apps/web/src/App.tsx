import { Link, Navigate, Route, Routes, useParams } from 'react-router';
import { Layout, Page } from './components/Layout';
import { ErrorNotice, Loading } from './components/ui';
import { useI18n } from './i18n';
import type { Company } from './lib/api';
import { useAuth, useUser } from './lib/auth';
import { ScopeProvider, useScope } from './lib/scope';
import { useApi } from './lib/useApi';
import { Account, ForcedPasswordChange } from './pages/Account';
import { Companies } from './pages/Companies';
import { Dashboard } from './pages/Dashboard';
import { HeadHistory } from './pages/HeadHistory';
import { Login } from './pages/Login';
import { ResultDetail } from './pages/ResultDetail';
import { Results } from './pages/Results';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { Upload } from './pages/Upload';
import { Users } from './pages/Users';

function NotFound() {
  const { t } = useI18n();
  const scope = useScope();
  return (
    <Page title={t('notFound.title')}>
      <div className="card empty">
        <b>{t('notFound.text')}</b>
        <Link to={scope.link('/')} className="btn">
          {t('notFound.home')}
        </Link>
      </div>
    </Page>
  );
}

/** Pages shared by the staff view, the company view and company members. */
const sharedRoutes = (
  <>
    <Route index element={<Dashboard />} />
    <Route path="results" element={<Results />} />
    <Route path="results/:id" element={<ResultDetail />} />
    <Route path="results/:id/history" element={<HeadHistory />} />
    <Route path="upload" element={<Upload />} />
  </>
);

/** FUJI Service sees a company exactly as its members do. */
function CompanyView() {
  const { companyId } = useParams();
  const { data, error, reload } = useApi<{ company: Company }>(`/companies/${companyId}`);
  if (error) {
    return (
      <div className="center-page">
        <ErrorNotice error={error} />
      </div>
    );
  }
  if (!data) return <Loading />;
  return (
    <ScopeProvider
      viewCompany={{ id: data.company.id, name: data.company.name, logoVersion: data.company.logoVersion }}
      onCompanyChange={reload}
    >
      <Routes>
        <Route element={<Layout />}>
          {sharedRoutes}
          <Route path="team" element={<Team />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ScopeProvider>
  );
}

function SignedIn() {
  const user = useUser();
  if (user.mustChangePassword) return <ForcedPasswordChange />;
  const staff = user.company.isService;
  const admin = staff && user.role === 'admin';
  return (
    <Routes>
      {staff && <Route path="/companies/:companyId/view/*" element={<CompanyView />} />}
      <Route
        path="/*"
        element={
          <ScopeProvider>
            <Routes>
              <Route element={<Layout />}>
                {sharedRoutes}
                <Route path="account" element={<Account />} />
                {staff && <Route path="companies" element={<Companies />} />}
                {staff && (admin || user.role === 'companyAdmin') && <Route path="users" element={<Users />} />}
                {admin && <Route path="settings" element={<Settings />} />}
                {!staff && user.role === 'companyAdmin' && <Route path="team" element={<Team />} />}
                <Route path="login" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </ScopeProvider>
        }
      />
    </Routes>
  );
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <SignedIn /> : <Login />;
}
