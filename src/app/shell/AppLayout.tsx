import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useOutlet, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChartNoAxesCombined, Dumbbell, Settings, Users } from 'lucide-react';
import { useRepo } from '../useRepo.ts';
import { ScreenHeader } from '../../ui/ScreenHeader.tsx';
import { copy } from '../../ui/copy.ts';
import { canGoBack, isDetail, parentTab } from './routes.ts';
import { shellCopy } from './copy.ts';
import { settingsSections } from '../../features/settings/sections.ts';
import { useOpenSession } from './useOpenSession.ts';
import './shell.css';

const TodayScreen = lazy(() => import('../../features/floor/FloorScreen.tsx'));

const tabs = [
  { to: '/', label: shellCopy.today, Icon: CalendarDays },
  { to: '/session', label: shellCopy.train, Icon: Dumbbell },
  { to: '/progress', label: copy.progressTitle, Icon: ChartNoAxesCombined },
  { to: '/crew', label: copy.crewTitle, Icon: Users },
];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const { id, date, section } = useParams();
  const repo = useRepo();
  const quickLog = location.pathname.startsWith('/log/');
  const [background, setBackground] = useState<{ pathname: string; outlet: ReactNode }>(() => ({
    pathname: quickLog ? '/' : location.pathname,
    outlet: quickLog ? <Suspense fallback={null}><TodayScreen /></Suspense> : outlet,
  }));
  // Keep the previous tab mounted behind the portal sheet, including its scroll/state.
  if (!quickLog && background.pathname !== location.pathname) {
    setBackground({ pathname: location.pathname, outlet });
  }
  const pathname = quickLog ? background.pathname : location.pathname;
  const currentTab = parentTab(pathname);
  const detail = isDetail(pathname);
  const open = useOpenSession();
  const exercise = useLiveQuery(async () => id
    ? (await repo.q.exercises()).find((row) => row.id === id) : undefined, [repo, id]);
  const title = pathname === '/session' ? copy.sessionTitle
    : pathname.startsWith('/exercise/') ? exercise?.name ?? copy.progressExercise
    : pathname.startsWith('/day/') ? date ?? copy.recentDays
      : pathname.startsWith('/settings') ? settingsSections.find((item) => item.id === section)?.title ?? copy.settingsTitle
        : tabs.find((tab) => tab.to === currentTab)?.label ?? shellCopy.today;
  const back = () => {
    if (canGoBack(window.history.state)) void navigate(-1);
    else void navigate(pathname.startsWith('/settings/') ? '/settings' : currentTab, { replace: true });
  };

  return <div className="app-shell">
    <div className="app-shell__header">
      <ScreenHeader title={title} onBack={detail ? back : undefined}
        trailing={pathname === '/' || pathname === '/crew' ? <Link className="app-shell__settings" to="/settings" aria-label={copy.settings}>
          <Settings size={24} aria-hidden="true" />
        </Link> : undefined} />
    </div>
    <div className="app-shell__content">{quickLog ? background.outlet : outlet}</div>
    <nav className="app-shell__tabs" aria-label={copy.appName}>
      {tabs.map(({ to, label, Icon }) => <Link key={to} to={to} className="app-shell__tab"
        aria-current={currentTab === to ? 'page' : undefined}>
        <span className="app-shell__tab-icon">
          <Icon size={24} aria-hidden="true" />
          {to === '/session' && open && <span className="app-shell__live" data-testid="session-live" aria-hidden="true" />}
        </span>
        <span>{label}</span>
      </Link>)}
    </nav>
    {quickLog && outlet}
  </div>;
}
