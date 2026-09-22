import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getLearner, useLearner } from "./state/store";
import { dateKey } from "./engine/progress";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/ui";
import Today from "./pages/Today";

// Larger screens load on demand so the learning surface opens instantly.
const Welcome = lazy(() => import("./pages/Welcome"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Course = lazy(() => import("./pages/Course"));
const Session = lazy(() => import("./pages/Session"));
const Practice = lazy(() => import("./pages/Practice"));
const Listening = lazy(() => import("./pages/Listening"));
const Pronunciation = lazy(() => import("./pages/Pronunciation"));
const Vocabulary = lazy(() => import("./pages/Vocabulary"));
const Phrases = lazy(() => import("./pages/Phrases"));
const Grammar = lazy(() => import("./pages/Grammar"));
const Speak = lazy(() => import("./pages/Speak"));
const Conversation = lazy(() => import("./pages/Conversation"));
const Review = lazy(() => import("./pages/Review"));
const Mistakes = lazy(() => import("./pages/Mistakes"));
const Progress = lazy(() => import("./pages/Progress"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));

function useAppearance() {
  const learner = useLearner();
  const theme = learner?.settings.theme ?? "system";
  const motion = learner?.settings.reducedMotion ?? "system";
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    if (motion === "on") root.setAttribute("data-motion", "reduced");
    else if (motion === "off") root.setAttribute("data-motion", "full");
    else root.removeAttribute("data-motion");
  }, [theme, motion]);
}

/** Daily reminder while Habla is open, if the learner hasn't practiced yet today. */
function useReminder() {
  const learner = useLearner();
  const r = learner?.settings.reminders;
  useEffect(() => {
    if (!r?.enabled || !("Notification" in window)) return;
    const check = () => {
      const s = getLearner();
      if (!s || Notification.permission !== "granted") return;
      const now = new Date();
      const today = dateKey(now.getTime());
      const [h, m] = r.time.split(":").map(Number);
      const due = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
      let sent: string | null = null;
      try {
        sent = localStorage.getItem("habla:reminded");
      } catch {
        /* storage unavailable */
      }
      if (due && sent !== today && (s.activity[today]?.seconds ?? 0) < 60) {
        new Notification("Time for a little Spanish", { body: "A short session keeps what you've learned from fading.", icon: `${import.meta.env.BASE_URL}favicon.svg` });
        try {
          localStorage.setItem("habla:reminded", today);
        } catch {
          /* storage unavailable */
        }
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [r?.enabled, r?.time]);
}

function Loading() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }} aria-busy="true" aria-label="Loading">
      <span className="spinner" />
    </div>
  );
}

function RequireLearner({ children, shell = true }: { children: ReactNode; shell?: boolean }) {
  const learner = useLearner();
  const location = useLocation();
  if (!learner) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  if (!learner.onboarded) return <Navigate to="/onboarding" replace />;
  return shell ? <AppShell>{children}</AppShell> : <>{children}</>;
}

export default function App() {
  useAppearance();
  useReminder();
  return (
    <ToastProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={<RequireLearner><Today /></RequireLearner>} />
            <Route path="/course" element={<RequireLearner><Course /></RequireLearner>} />
            <Route path="/session/:kind/:arg?" element={<RequireLearner shell={false}><Session /></RequireLearner>} />
            <Route path="/practice" element={<RequireLearner><Practice /></RequireLearner>} />
            <Route path="/practice/listening/:id?" element={<RequireLearner><Listening /></RequireLearner>} />
            <Route path="/practice/pronunciation/:id?" element={<RequireLearner><Pronunciation /></RequireLearner>} />
            <Route path="/practice/vocabulary" element={<RequireLearner><Vocabulary /></RequireLearner>} />
            <Route path="/practice/phrases" element={<RequireLearner><Phrases /></RequireLearner>} />
            <Route path="/practice/grammar/:id?" element={<RequireLearner><Grammar /></RequireLearner>} />
            <Route path="/speak" element={<RequireLearner><Speak /></RequireLearner>} />
            <Route path="/speak/conversation/:scenario" element={<RequireLearner shell={false}><Conversation /></RequireLearner>} />
            <Route path="/review" element={<RequireLearner><Review /></RequireLearner>} />
            <Route path="/review/mistakes" element={<RequireLearner><Mistakes /></RequireLearner>} />
            <Route path="/progress" element={<RequireLearner><Progress /></RequireLearner>} />
            <Route path="/settings" element={<RequireLearner><Settings /></RequireLearner>} />
            <Route path="/profile" element={<RequireLearner><Profile /></RequireLearner>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}
