async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // Fall back to a status-based message below.
  }
  return `Transcription failed with status ${response.status}.`;
}

export async function transcribeAudio(audio: Blob, signal?: AbortSignal): Promise<string> {
  const formData = new FormData();
  const extension = audio.type.includes("mp4") ? "m4a" : "webm";
  formData.append("audio", new File([audio], `dictation.${extension}`, { type: audio.type }));

  const response = await fetch("/api/transcriptions", {
    method: "POST",
    body: formData,
    signal,
  });

  if (!response.ok) throw new Error(await readError(response));

  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("text" in body) ||
    typeof body.text !== "string"
  ) {
    throw new Error("The backend returned an invalid transcription.");
  }

  return body.text.trim();
}
