/** True when the browser can create a WebGL (2 or 1) context. Never throws. */
export function detectWebGL(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  // jsdom exposes canvas without an implementation: treat as unavailable without noise.
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
