import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_TABLES_DIR = path.join(process.cwd(), ".agent-data", "data-tables");
const TABLE_ID_PATTERN = /^[a-f0-9-]{36}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ tableId: string }> },
) {
  const { tableId } = await context.params;

  if (!TABLE_ID_PATTERN.test(tableId)) {
    return Response.json({ error: "Invalid table id." }, { status: 400 });
  }

  try {
    const raw = await readFile(path.join(DATA_TABLES_DIR, `${tableId}.json`), "utf8");
    return new Response(raw, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ error: "Table not found." }, { status: 404 });
    }

    throw error;
  }
}
