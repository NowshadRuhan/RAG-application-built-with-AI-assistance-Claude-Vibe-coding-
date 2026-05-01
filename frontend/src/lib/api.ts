const base = () => import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");

/** Bearer-authenticated JSON helpers against FastAPI. */
export async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res;
}

export type ChatHandlers = {
  onToken: (t: string) => void;
  onCitations?: (items: unknown[]) => void;
  onDone?: () => void;
  onError?: (msg: string) => void;
};

/** SSE over fetch — supports Authorization header unlike EventSource. */
export async function streamMessage(
  conversationId: string,
  text: string,
  token: string,
  handlers: ChatHandlers,
) {
  const res = await fetch(`${base()}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || "Failed to start stream");
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      let ev = "message";
      let dataLine: string | null = null;
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(dataLine) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (ev === "token" && typeof payload.text === "string") {
        handlers.onToken(payload.text);
      } else if (ev === "citations" && Array.isArray(payload.items)) {
        handlers.onCitations?.(payload.items);
      } else if (ev === "done") {
        handlers.onDone?.();
      } else if (ev === "error") {
        handlers.onError?.(String(payload.message ?? "Unknown error"));
      }
    }
  }
}
