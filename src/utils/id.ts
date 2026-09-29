export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // randomUUID is unavailable on insecure origins (e.g. LAN testing over http).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
