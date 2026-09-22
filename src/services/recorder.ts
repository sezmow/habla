// Microphone capture: live input levels for the waveform, and a recording the
// learner can play back to compare with the model.

export type MicPermission = "granted" | "denied" | "prompt" | "unsupported";

export async function micPermission(): Promise<MicPermission> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state as MicPermission;
  } catch {
    return "prompt";
  }
}

export interface Recording {
  stop(): Promise<{ url: string | null; durationMs: number }>;
  cancel(): void;
}

/** Start capturing; `onLevel` receives 0–1 input levels ~60 times a second. */
export async function startRecording(onLevel: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    raf = requestAnimationFrame(tick);
  };
  tick();

  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  if (typeof MediaRecorder !== "undefined") {
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start();
  }
  const started = performance.now();
  const cleanup = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
  return {
    stop: () =>
      new Promise((resolve) => {
        const durationMs = performance.now() - started;
        if (!recorder || recorder.state === "inactive") {
          cleanup();
          resolve({ url: null, durationMs });
          return;
        }
        recorder.onstop = () => {
          cleanup();
          resolve({ url: chunks.length ? URL.createObjectURL(new Blob(chunks, { type: recorder!.mimeType })) : null, durationMs });
        };
        recorder.stop();
      }),
    cancel: () => {
      try {
        recorder?.stop();
      } catch {
        /* already stopped */
      }
      cleanup();
    },
  };
}
