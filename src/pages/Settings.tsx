import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Upload, Trash2, Volume2, Mic, Check, Info } from "lucide-react";
import { useLearner, actions } from "../state/store";
import type { Settings as S } from "../engine/types";
import { PageHead } from "../components/AppShell";
import { Segmented, Switch, Modal, useToast } from "../components/ui";
import { spanishVoices, voicesReady, pickVoice, speak } from "../services/tts";
import { micPermission, startRecording, type MicPermission } from "../services/recorder";
import { sttAvailable } from "../services/stt";
import { aiStatus, type AiStatus } from "../services/ai";

function Row({ title, desc, children, id }: { title: string; desc?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <div className="setting-row stack-mobile" id={id}>
      <div className="setting-text">
        <div className="setting-title">{title}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      <div style={{ flex: "none" }}>{children}</div>
    </div>
  );
}

export default function Settings() {
  const learner = useLearner()!;
  const s = learner.settings;
  const set = (patch: Partial<S>) => actions.settings(patch);
  const navigate = useNavigate();
  const toast = useToast();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(spanishVoices());
  const [mic, setMic] = useState<MicPermission | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [name, setName] = useState(learner.profile.name);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    voicesReady().then(setVoices);
    micPermission().then(setMic);
    aiStatus().then(setAi);
  }, []);
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, []);

  const current = pickVoice(s.variety, s.voiceURI);
  const preview = () => speak("Hola, ¿qué tal? Vamos a practicar un poco de español.", { rate: 0.95 * s.audioRate, variety: s.variety, voiceURI: s.voiceURI });

  const exportData = () => {
    const blob = new Blob([actions.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `habla-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page page-narrow">
      <PageHead title="Settings" />

      <section className="settings-section">
        <h2>Learning</h2>
        <div className="card">
          <Row title="Spanish variety" desc="Sets voices, speech recognition and which regional words are shown first. Regional words are always labeled.">
            <select className="select" value={s.variety} onChange={(e) => set({ variety: e.target.value as S["variety"], voiceURI: null })} aria-label="Spanish variety">
              <option value="latam">Latin American (neutral)</option>
              <option value="mx">Mexican</option>
              <option value="es">Spain</option>
              <option value="rioplatense">Argentina &amp; Uruguay</option>
            </select>
          </Row>
          <Row title="Daily goal" desc="Sessions are built to fit this. Default is 15 minutes." id="goal">
            <Segmented label="Daily goal" value={s.goalMinutes} onChange={(v) => set({ goalMinutes: v })} options={([5, 10, 15, 30, 60] as const).map((m) => ({ value: m, label: `${m}` }))} />
          </Row>
          <Row title="Difficulty" desc="Adaptive follows your performance. Gentle eases conversations; challenging pushes them.">
            <Segmented label="Difficulty" value={s.difficulty} onChange={(v) => set({ difficulty: v })} options={[{ value: "gentle", label: "Gentle" }, { value: "adaptive", label: "Adaptive" }, { value: "challenging", label: "Challenging" }]} />
          </Row>
          <Row title="Translation & hints" desc="Adaptive removes English and hints as you improve. “More” keeps support longer; “Less” moves you to Spanish-only sooner.">
            <Segmented label="Assistance" value={s.assistance} onChange={(v) => set({ assistance: v })} options={[{ value: "more", label: "More" }, { value: "adaptive", label: "Adaptive" }, { value: "less", label: "Less" }]} />
          </Row>
        </div>
      </section>

      <section className="settings-section">
        <h2>Audio</h2>
        <div className="card">
          <Row title="Speech speed" desc="Applies to all audio. Slow buttons stay available everywhere.">
            <Segmented label="Speech speed" value={s.audioRate} onChange={(v) => set({ audioRate: v })} options={[{ value: 0.8, label: "0.8×" }, { value: 0.9, label: "0.9×" }, { value: 1, label: "1×" }, { value: 1.1, label: "1.1×" }]} />
          </Row>
          <Row
            title="Voice"
            desc={voices.length ? `${voices.length} Spanish ${voices.length === 1 ? "voice" : "voices"} on this device. Dialogues use a second voice when one is available.` : "No Spanish voice is installed on this device. Add one in your system's speech settings for audio."}
          >
            <div className="row" style={{ gap: 8 }}>
              <select className="select" style={{ maxWidth: 220 }} value={s.voiceURI ?? ""} onChange={(e) => set({ voiceURI: e.target.value || null })} aria-label="Voice" disabled={!voices.length}>
                <option value="">Automatic{current ? ` (${current.name})` : ""}</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} — {v.lang}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={preview} aria-label="Preview voice" disabled={!voices.length}>
                <Volume2 size={19} />
              </button>
            </div>
          </Row>
          <Row title="Captions" desc="Show text for audio after you've had a chance to listen.">
            <Switch checked={s.captions} onChange={(v) => set({ captions: v })} label="Captions" />
          </Row>
        </div>
      </section>

      <section className="settings-section">
        <h2>Speaking</h2>
        <div className="card">
          <Row title="Speaking exercises" desc="Turn off if you can't use a microphone right now — those tasks become writing tasks (and count as writing, not speaking).">
            <Switch checked={s.speakingEnabled} onChange={(v) => set({ speakingEnabled: v })} label="Speaking exercises" />
          </Row>
          <Row
            title="Microphone"
            desc={
              <>
                {mic === "granted" ? "Allowed." : mic === "denied" ? "Blocked — allow it in your browser's site settings." : mic === "unsupported" ? "This browser can't access a microphone." : "Not requested yet."}{" "}
                {sttAvailable() ? "Speech recognition is available." : "Speech recognition isn't available in this browser; speaking is self-assessed."}
              </>
            }
          >
            <button
              className="btn btn-secondary btn-sm"
              disabled={mic === "granted" || mic === "unsupported"}
              onClick={async () => {
                try {
                  const r = await startRecording(() => {});
                  r.cancel();
                } catch {
                  /* denied */
                }
                setMic(await micPermission());
              }}
            >
              {mic === "granted" ? (
                <>
                  <Check size={15} /> Allowed
                </>
              ) : (
                <>
                  <Mic size={15} /> Allow access
                </>
              )}
            </button>
          </Row>
          <Row title="AI conversation partner" desc={ai == null ? "Checking…" : ai.available ? `Connected (${ai.model}). Your typed or transcribed replies are sent to the conversation service to generate responses.` : `${ai.reason} Guided roleplays still work.`}>
            <Switch checked={s.aiConversation && !!ai?.available} onChange={(v) => set({ aiConversation: v })} label="AI conversation partner" />
          </Row>
        </div>
      </section>

      <section className="settings-section">
        <h2>Reminders</h2>
        <div className="card">
          <Row title="Daily reminder" desc="Shown by your browser at this time if you haven't practiced yet, while Habla is open in a tab.">
            <div className="row" style={{ gap: 10 }}>
              <input type="time" className="input" style={{ width: 120 }} value={s.reminders.time} onChange={(e) => set({ reminders: { ...s.reminders, time: e.target.value } })} aria-label="Reminder time" disabled={!s.reminders.enabled} />
              <Switch
                checked={s.reminders.enabled}
                onChange={async (v) => {
                  if (v && "Notification" in window && Notification.permission !== "granted") {
                    const p = await Notification.requestPermission();
                    if (p !== "granted") {
                      toast("Notifications are blocked for this site.");
                      return;
                    }
                  }
                  set({ reminders: { ...s.reminders, enabled: v } });
                }}
                label="Daily reminder"
              />
            </div>
          </Row>
        </div>
      </section>

      <section className="settings-section">
        <h2>Appearance & accessibility</h2>
        <div className="card">
          <Row title="Theme">
            <Segmented label="Theme" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </Row>
          <Row title="Reduce motion" desc="Removes transitions and animations. “System” follows your device setting.">
            <Segmented label="Reduce motion" value={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} options={[{ value: "system", label: "System" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} />
          </Row>
        </div>
      </section>

      <section className="settings-section">
        <h2>Privacy</h2>
        <div className="card">
          <ul className="privacy-list">
            <li>
              <Info size={16} /> Your progress, mistakes and history are stored only in this browser. Nothing is uploaded to Habla.
            </li>
            <li>
              <Info size={16} /> Speech recognition is provided by your browser. In Chrome, audio is processed by Google's speech service; in Safari, by Apple.
            </li>
            <li>
              <Info size={16} /> Your recordings stay on your device and are discarded when you leave the exercise.
            </li>
            <li>
              <Info size={16} /> Free conversation (when connected) sends your replies and a summary of your level — known words and recent mistake types, not your history — to the conversation service.
            </li>
          </ul>
        </div>
      </section>

      <section className="settings-section">
        <h2>Account & data</h2>
        <div className="card">
          <Row title="Your name" desc="Used in greetings and in your Spanish sentences.">
            <form
              className="row"
              style={{ gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) {
                  actions.profile({ name: name.trim() });
                  toast("Name updated");
                }
              }}
            >
              <input className="input" style={{ width: 180 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" maxLength={40} />
              <button className="btn btn-secondary btn-sm" disabled={!name.trim() || name === learner.profile.name}>
                Save
              </button>
            </form>
          </Row>
          <Row title="Export your data" desc="Download everything as a JSON file — also works as a backup.">
            <button className="btn btn-secondary btn-sm" onClick={exportData}>
              <Download size={15} /> Export
            </button>
          </Row>
          <Row title="Restore from a backup">
            <button className="btn btn-secondary btn-sm" onClick={() => file.current?.click()}>
              <Upload size={15} /> Import
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const err = actions.importJson(await f.text());
                toast(err ?? "Backup restored");
              }}
            />
          </Row>
          <Row title="Delete all data" desc={learner.demo ? "You're using the demo learner. Deleting it lets you start your own profile." : "Permanently removes your progress from this browser."}>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmReset(true)}>
              <Trash2 size={15} /> Delete
            </button>
          </Row>
        </div>
      </section>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Delete all data">
        <h2>Delete all your data?</h2>
        <p className="muted" style={{ margin: "8px 0 20px" }}>This removes every word, review and conversation from this browser. Export first if you might want it back.</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ background: "var(--danger)" }}
            onClick={() => {
              actions.reset();
              navigate("/welcome", { replace: true });
            }}
          >
            Delete everything
          </button>
        </div>
      </Modal>
    </div>
  );
}
