import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { BookOpen, Layers, Mic, RotateCcw, LineChart, Settings, CalendarCheck, User } from "lucide-react";
import { Logo, LogoMark } from "./Logo";
import { Ring } from "./ui";
import { useLearner, useNow } from "../state/store";
import { consistency } from "../engine/gamification";
import { dueItems } from "../engine/session";

const NAV = [
  { to: "/", label: "Learn", icon: BookOpen, match: ["/", "/course"] },
  { to: "/practice", label: "Practice", icon: Layers },
  { to: "/speak", label: "Speak", icon: Mic },
  { to: "/review", label: "Review", icon: RotateCcw },
  { to: "/progress", label: "Progress", icon: LineChart },
];

function isActive(pathname: string, item: (typeof NAV)[number]): boolean {
  if (item.match) return item.match.includes(pathname) || pathname.startsWith("/course");
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

export function StreakDisplay({ compact }: { compact?: boolean }) {
  const learner = useLearner()!;
  const now = useNow();
  const c = consistency(learner, now);
  const label = c.streak >= 2 ? `${c.streak}-day streak` : `${c.daysThisWeek} ${c.daysThisWeek === 1 ? "day" : "days"} this week`;
  return (
    <Link to="/progress" className="status-pill" aria-label={`Consistency: ${label}`} title="Consistency">
      <CalendarCheck size={17} color="var(--primary)" />
      <span className="num">{c.streak >= 2 ? c.streak : c.daysThisWeek}</span>
      {!compact && <span className="sub hide-mobile">{c.streak >= 2 ? "days in a row" : "this week"}</span>}
    </Link>
  );
}

export function GoalDisplay() {
  const learner = useLearner()!;
  const now = useNow();
  const c = consistency(learner, now);
  const mins = Math.floor(c.todaySeconds / 60);
  return (
    <Link to="/settings#goal" className="status-pill" aria-label={`Daily goal: ${mins} of ${learner.settings.goalMinutes} minutes`} title="Daily goal">
      <Ring value={c.todaySeconds / c.goalSeconds} size={22} stroke={3} done={c.goalMet} />
      <span className="num">
        {mins}
        <span className="sub">/{learner.settings.goalMinutes} min</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const learner = useLearner()!;
  const now = useNow();
  const due = dueItems(learner, now).length;
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  const initial = (learner.profile.name || "?").charAt(0).toUpperCase();

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/" className="brand" aria-label="Habla home" style={{ color: "inherit", textDecoration: "none" }}>
          <Logo size={30} />
        </Link>
        <nav className="stack" style={{ "--gap": "2px" } as React.CSSProperties}>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-item" aria-current={isActive(pathname, item) ? "page" : undefined} title={item.label}>
              <item.icon size={20} strokeWidth={isActive(pathname, item) ? 2.3 : 2} />
              <span className="nav-label">{item.label}</span>
              {item.to === "/review" && due > 0 && <span className="nav-count num">{due > 99 ? "99+" : due}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/settings" className="nav-item" aria-current={pathname.startsWith("/settings") ? "page" : undefined} title="Settings">
            <Settings size={20} />
            <span className="nav-label">Settings</span>
          </NavLink>
        </div>
      </aside>

      <div className="main-col">
        <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
          <Link to="/" className="mobile-brand" aria-label="Habla home">
            <LogoMark size={28} />
          </Link>
          <div className="topbar-right">
            <StreakDisplay />
            <GoalDisplay />
            <Link to="/profile" className="avatar" aria-label="Profile" title={learner.profile.name}>
              {initial}
            </Link>
            <Link to="/settings" className="icon-btn hide-mobile" aria-label="Settings" title="Settings">
              <Settings size={20} />
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1} style={{ outline: "none" }}>
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        {[...NAV.slice(0, 4), { to: "/profile", label: "Profile", icon: User }].map((item) => {
          const active = item.to === "/profile" ? ["/profile", "/progress", "/settings"].some((p) => pathname.startsWith(p)) : isActive(pathname, item as (typeof NAV)[number]);
          return (
            <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined}>
              <item.icon size={22} />
              {item.label}
              {item.to === "/review" && due > 0 && <span className="dot num">{due > 99 ? "99+" : due}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHead({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}
