export interface CheckTimeInput {
  timeZone: string | null;
}

export function getCurrentTimeResult({ timeZone }: CheckTimeInput) {
  const now = new Date();
  let formatted: string;

  try {
    formatted = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: timeZone ?? "Asia/Calcutta",
    }).format(now);
  } catch {
    formatted = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: "Asia/Calcutta",
    }).format(now);
  }

  return {
    iso: now.toISOString(),
    formatted,
    requestedTimeZone: timeZone,
  };
}
