export interface ServerTimeInput {
  timeZone: string | null;
}

export function getServerTimeResult({ timeZone }: ServerTimeInput) {
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
