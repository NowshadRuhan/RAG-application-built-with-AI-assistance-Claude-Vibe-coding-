import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, streamMessage } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ConvRow = { id: string; title: string | null; updated_at?: string };
type Msg = { role: "user" | "assistant"; content: string };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [bootAuth, setBootAuth] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authErr, setAuthErr] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, Msg[]>>({});

  const [composer, setComposer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [citations, setCitations] = useState<string>("");

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setBootAuth(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => subscription.unsubscribe();
  }, []);

  const token = session?.access_token ?? "";

  const loadConversations = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch("/api/conversations", token);
    const rows = (await res.json()) as ConvRow[];
    setConversations(rows);
    setActiveId((prev) => {
      if (prev && rows.some((r) => r.id === prev)) return prev;
      return rows[0]?.id ?? null;
    });
  }, [token]);

  useEffect(() => {
    if (session) void loadConversations();
    else {
      setConversations([]);
      setActiveId(null);
      setMessagesByConv({});
    }
  }, [session, loadConversations]);

  const messages = useMemo(() => (activeId ? messagesByConv[activeId] ?? [] : []), [activeId, messagesByConv]);

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthErr(error.message);
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setAuthErr(error.message);
    else setAuthErr("Check your email to confirm signup (if required by Supabase settings).");
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setAuthErr(error.message);
    else setAuthErr("Magic link sent — check your inbox.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function newChat() {
    setChatErr(null);
    try {
      const res = await apiFetch("/api/conversations", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: null }),
      });
      const row = (await res.json()) as ConvRow;
      setConversations((c) => [row, ...c]);
      setActiveId(row.id);
      setMessagesByConv((m) => ({ ...m, [row.id]: [] }));
      setCitations("");
    } catch (err) {
      setChatErr(err instanceof Error ? err.message : "Could not create chat");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !composer.trim() || streaming) return;
    const text = composer.trim();
    setComposer("");
    setChatErr(null);
    setCitations("");

    const uid = activeId;
    setMessagesByConv((m) => ({
      ...m,
      [uid]: [...(m[uid] ?? []), { role: "user", content: text }, { role: "assistant", content: "" }],
    }));
    setStreaming(true);

    let buf = "";
    try {
      await streamMessage(uid, text, token, {
        onToken: (t) => {
          buf += t;
          setMessagesByConv((m) => {
            const list = [...(m[uid] ?? [])];
            const last = list[list.length - 1];
            if (last?.role === "assistant") {
              list[list.length - 1] = { role: "assistant", content: buf };
            }
            return { ...m, [uid]: list };
          });
        },
        onCitations: (items) => {
          try {
            setCitations(JSON.stringify(items, null, 2));
          } catch {
            setCitations(String(items));
          }
        },
        onDone: () => void loadConversations(),
        onError: (msg) => setChatErr(msg),
      });
    } catch (err) {
      setChatErr(err instanceof Error ? err.message : "Stream failed");
    } finally {
      setStreaming(false);
    }
  }

  async function onPickFile(f: File | null) {
    if (!f || !activeId) return;
    setUploadNote(null);
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("upload", f);
      const base = import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/conversations/${activeId}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      setUploadNote(`Uploaded ${f.name}`);
    } catch (err) {
      setUploadNote(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (bootAuth) {
    return <div className="flex min-h-screen items-center justify-center text-zinc-400">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-400">Supabase Auth → FastAPI verifies the same JWT.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form className="flex flex-col gap-3" onSubmit={signInPassword}>
              <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">Sign in</Button>
                <Button type="button" variant="outline" onClick={signUp}>
                  Sign up
                </Button>
              </div>
            </form>
            <form onSubmit={magicLink}>
              <Button type="submit" variant="ghost" className="w-full">
                Email magic link instead
              </Button>
            </form>
            {authErr && <p className="text-sm text-amber-400">{authErr}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl gap-0 md:gap-4 md:p-4">
      <aside className="flex w-full shrink-0 flex-col border-zinc-800 md:w-56 md:border-r md:pr-4">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 p-3 md:border-0 md:p-0">
          <span className="text-sm font-medium text-zinc-300">Chats</span>
          <Button size="sm" variant="outline" onClick={() => void signOut()}>
            Log out
          </Button>
        </div>
        <div className="flex gap-2 p-3 md:flex-col md:p-0 md:pt-2">
          <Button size="sm" className="flex-1 md:flex-none" onClick={() => void newChat()}>
            New chat
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3 pt-0 md:p-0 md:pt-2">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActiveId(c.id);
                setChatErr(null);
                setCitations("");
              }}
              className={`rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-900 ${activeId === c.id ? "bg-zinc-900 text-zinc-50" : "text-zinc-400"}`}
            >
              {c.title?.trim() || "Untitled"}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col border-t border-zinc-800 md:border-t-0">
        <header className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <span className="text-sm text-zinc-500">Module 1 · OpenAI Responses + file_search</span>
          <input ref={fileRef} type="file" accept=".txt,.pdf,.md,.csv,.html" className="hidden" onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)} />
          <Button size="sm" variant="outline" disabled={!activeId || uploadBusy} onClick={() => fileRef.current?.click()}>
            {uploadBusy ? "Uploading…" : "Attach file"}
          </Button>
          {uploadNote && <span className="text-xs text-zinc-400">{uploadNote}</span>}
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          {!activeId ? (
            <p className="text-zinc-500">Create a new chat to begin.</p>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                {messages.map((m, i) => (
                  <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "ml-auto bg-zinc-700 text-zinc-50" : "mr-auto bg-zinc-900 text-zinc-200"}`}>
                    <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{m.role}</div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
              </div>
              {citations && (
                <details className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-xs">
                  <summary className="cursor-pointer text-zinc-400">File search citations</summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-zinc-500">{citations}</pre>
                </details>
              )}
              {chatErr && <p className="text-sm text-amber-400">{chatErr}</p>}
              <form className="flex gap-2" onSubmit={sendMessage}>
                <Input
                  className="flex-1"
                  placeholder="Message…"
                  value={composer}
                  disabled={streaming}
                  onChange={(e) => setComposer(e.target.value)}
                />
                <Button type="submit" disabled={streaming || !composer.trim()}>
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
