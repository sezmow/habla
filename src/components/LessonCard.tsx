import { Check, Lock, Play, MessageCircle, RotateCcw } from "lucide-react";
import type { Lesson } from "../engine/types";

export type LessonStatus = "done" | "tested" | "current" | "locked";

export function LessonCard({ lesson, status, onOpen }: { lesson: Lesson; status: LessonStatus; onOpen: () => void }) {
  const icon =
    status === "done" ? <Check size={16} strokeWidth={3} /> : status === "tested" ? <Check size={16} /> : status === "current" ? <Play size={15} fill="currentColor" /> : <Lock size={15} />;
  return (
    <button type="button" className={`lesson-row ${status}`} onClick={onOpen} aria-label={`${lesson.title} — ${status === "locked" ? "locked" : status === "current" ? "up next" : "completed"}`}>
      <span className="lesson-status" aria-hidden="true">
        {icon}
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="lesson-title">
          {lesson.title} <span className="es faint">· {lesson.titleEs}</span>
        </span>
        <span className="lesson-goal">{lesson.goal}</span>
      </span>
      {lesson.kind === "scenario" && (
        <span className="chip accent hide-mobile">
          <MessageCircle size={12} /> Roleplay
        </span>
      )}
      {status === "tested" && <span className="chip hide-mobile">Tested out</span>}
      <span className="small faint num hide-mobile">{lesson.minutes} min</span>
      {(status === "done" || status === "tested") && <RotateCcw size={16} className="faint" aria-hidden="true" />}
    </button>
  );
}
