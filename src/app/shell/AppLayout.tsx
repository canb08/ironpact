import { lazy, Suspense, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useOutlet, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChartNoAxesCombined, Dumbbell, Images, Settings, Users } from 'lucide-react';
import { useRepo } from '../useRepo.ts';
import { ScreenHeader } from '../../ui/ScreenHeader.tsx';
import { copy } from '../../ui/copy.ts';
import { formatDate } from '../../core/formatDate.ts';
import { localDateOf } from '../../core/weeks.ts';
import { canGoBack, isDetail, parentTab } from './routes.ts';
import { settingsSections } from '../../features/settings/sections.ts';
import { useOpenSession } from './useOpenSession.ts';
import { screenReady, startViewTransition } from '../../ui/motion/viewTransition.ts';
import '../../ui/motion/navigation.css';
import './shell.css';
import { ProofPromptProvider } from '../../features/proof/ProofPromptProvider.tsx';
const ProofCrewLink = lazy(() => import('../../features/proof/ProofCrewLink.tsx'));

const TodayScreen = lazy(() => import('../../features/floor/FloorScreen.tsx'));

const tabs = [
  { to: '/', label: copy.x10Today, Icon: CalendarDays },
  { to: '/session', label: copy.x10Train, Icon: Dumbbell },
  { to: '/proof', label: copy.y9Title, Icon: Images },
  { to: '/progress', label: copy.progressTitle, Icon: ChartNoAxesCombined },
  { to: '/crew', label: copy.crewTitle, Icon: Users },
];

function tabDirection(from: string, to: string): 'left' | 'right' | null {
  const before = tabs.findIndex((tab) => tab.to === from);
  const after = tabs.findIndex((tab) => tab.to === to);
  return before < 0 || after < 0 || before === after ? null : after > before ? 'left' : 'right';
}

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
  const me = useLiveQuery(() => repo.q.me(), [repo]);
  const today = localDateOf(new Date().toISOString(), me?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const title = pathname === '/session' ? copy.sessionTitle
    : pathname.startsWith('/exercise/') ? exercise?.name ?? copy.progressExercise
    : pathname.startsWith('/day/') ? date ? formatDate(date, today, copy) : copy.recentDays
      : pathname.startsWith('/settings') ? settingsSections.find((item) => item.id === section)?.title ?? copy.settingsTitle
        : tabs.find((tab) => tab.to === currentTab)?.label ?? copy.x10Today;
  const transitionTo = (to: string | number, replace = false) => {
    const target = typeof to === 'string' ? to : currentTab;
    const direction = tabDirection(pathname, target);
    const shared = pathname === '/progress' && target.startsWith('/exercise/')
      || pathname.startsWith('/exercise/') && target === '/progress';
    if (!direction && !shared) { if (typeof to === 'number') void navigate(to); else void navigate(to, { replace }); return; }
    const root = document.documentElement;
    if (direction) root.dataset.tabDirection = direction;
    else delete root.dataset.tabDirection;
    const name = document.querySelector<HTMLElement>('.app-shell__header h1');
    if (shared && pathname.startsWith('/exercise/')) {
      if (name) name.style.viewTransitionName = 'exercise-name';
      const chart = document.querySelector<SVGElement>('.exercise-detail .progress-svg');
      if (chart) chart.style.viewTransitionName = 'exercise-chart';
    }
    startViewTransition(async () => {
      if (typeof to === 'number') await navigate(to);
      else await navigate(to, { flushSync: true, replace });
      const selector = target === '/' ? '[data-testid="shared-bar"]'
        : target === '/session' ? '.session-active, [role="dialog"]'
        : target === '/proof' ? '.proof-stats' : target === '/progress' ? '.progress-lifts' : target === '/crew' ? '.crew-hero' : '.exercise-detail';
      await screenReady(selector);
      if (shared) {
        const row = document.querySelector<HTMLAnchorElement>(`a.progress-lift-link[href="${pathname.startsWith('/exercise/') ? pathname : target}"]`);
        const label = row?.querySelector<HTMLElement>('.ui-list-row__title');
        const chart = row?.closest('li')?.querySelector<SVGElement>('.progress-svg--spark');
        if (label) label.style.viewTransitionName = 'exercise-name';
        if (chart) chart.style.viewTransitionName = 'exercise-chart';
        const detailChart = document.querySelector<SVGElement>('.exercise-detail .progress-svg');
        if (detailChart) detailChart.style.viewTransitionName = 'exercise-chart';
        const heading = document.querySelector<HTMLElement>('.app-shell__header h1');
        if (heading) heading.style.viewTransitionName = target.startsWith('/exercise/') ? 'exercise-name' : 'none';
      }
    }, me?.reduce_motion);
  };
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!anchor || anchor.target || anchor.hasAttribute('download') || anchor.origin !== locationOrigin()) return;
    const to = anchor.pathname;
    if (anchor.search) return;
    if (!tabDirection(pathname, to) && !(pathname === '/progress' && to.startsWith('/exercise/'))) return;
    event.preventDefault();
    document.querySelectorAll<HTMLElement | SVGElement>('[style*="view-transition-name"]').forEach((node) => node.style.viewTransitionName = 'none');
    const label = anchor.querySelector<HTMLElement>('.ui-list-row__title');
    const chart = anchor.closest('li')?.querySelector<SVGElement>('.progress-svg--spark');
    if (label) label.style.viewTransitionName = 'exercise-name';
    if (chart) chart.style.viewTransitionName = 'exercise-chart';
    transitionTo(to);
  };
  const back = () => {
    if (canGoBack(window.history.state)) transitionTo(-1);
    else transitionTo(pathname.startsWith('/settings/') ? '/settings' : currentTab, true);
  };

  return <ProofPromptProvider defer={quickLog}><div className="app-shell" onClickCapture={follow}>
    <div className="app-shell__header">
      <ScreenHeader title={title} onBack={detail ? back : undefined}
        trailing={pathname === '/' || pathname === '/crew' ? <Link className="app-shell__settings" to="/settings" aria-label={copy.settings}>
          <Settings size={24} aria-hidden="true" />
        </Link> : undefined} />
    </div>
    <div className="app-shell__content">{quickLog ? background.outlet : outlet}{pathname === '/crew' && <Suspense fallback={null}><ProofCrewLink /></Suspense>}</div>
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
  </div></ProofPromptProvider>;
}

function locationOrigin() { return window.location.origin; }
