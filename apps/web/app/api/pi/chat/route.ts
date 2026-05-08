import { NextResponse } from "next/server";
import { runPiChat, type PiChatRequest } from "../../../../lib/pi";

// `pi --print` is a Node child process; the `better-sqlite3` neighbours need
// the Node runtime, and ReadableStream streaming over fetch responses is only
// reliable on Node here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let payload: PiChatRequest;
  try {
    payload = (await request.json()) as PiChatRequest;
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Request body must be JSON." },
      { status: 400 },
    );
  }

  if (!payload.message?.trim()) {
    return NextResponse.json(
      { error: "MISSING_MESSAGE", message: "Provide a non-empty `message`." },
      { status: 400 },
    );
  }

  let handle;
  try {
    handle = await runPiChat(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "PI_SPAWN_ERROR", message },
      { status: 500 },
    );
  }

  return new Response(handle.stream, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-pi-chat-id": handle.chatId,
      "x-pi-attached-files": String(handle.attachedFiles.length),
      "x-pi-continued": handle.continued ? "1" : "0",
      "x-content-type-options": "nosniff",
    },
  });
}
