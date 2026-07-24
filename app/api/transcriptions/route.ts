import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function unavailableReason(): string | null {
  if (!process.env.OPENAI_API_KEY) return "OPENAI_API_KEY is not configured.";
  return null;
}

export async function POST(request: Request) {
  const unavailable = unavailableReason();
  if (unavailable) {
    return Response.json(
      { error: unavailable },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Request body must be multipart form data." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json(
      { error: "A non-empty audio file is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (audio.size >= MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "The recording must be smaller than 25 MB." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const transcription = await new OpenAI().audio.transcriptions.create(
      {
        file: audio,
        model: TRANSCRIPTION_MODEL,
        response_format: "json",
      },
      { signal: request.signal },
    );

    return Response.json(
      { text: transcription.text.trim() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to transcribe audio", error);
    return Response.json(
      { error: "Caddie could not transcribe the recording. Please try again." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
