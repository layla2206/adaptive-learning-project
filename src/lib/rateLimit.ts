// In-memory sliding window — resets on server restart and doesn't share
// state across serverless instances. Fine for this single-process dev/demo
// deployment; move to a shared store (Redis, or a DB table) before scaling
// past one instance.
const attempts = new Map<string, number[]>();

export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    attempts.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  attempts.set(key, timestamps);
  return false;
}
