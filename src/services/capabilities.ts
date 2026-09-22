import { getLearner } from "../state/store";
import { sttAvailable } from "./stt";

/** Can this device take spoken answers (recognition, or at least a microphone for self-assessment)? */
export function speakingAvailable(): boolean {
  const s = getLearner()?.settings;
  return !!s?.speakingEnabled && (sttAvailable() || (typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia));
}
