"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Item = { id: string; name: string; checked: boolean; updatedAt: number };
type Data = { items: Item[]; suggestions: string[] };

const norm = (s: string) => s.trim().toLowerCase();

export default function Home() {
  const [data, setData] = useState<Data>({ items: [], suggestions: [] });
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/items", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoaded(true);
    }
  }, []);

  // Keep everyone's view in sync: poll, and refresh when the tab comes back.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  async function send(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) setData(await res.json());
  }

  const toBuy = data.items.filter((i) => !i.checked);
  const done = data.items.filter((i) => i.checked).sort((a, b) => b.updatedAt - a.updatedAt);

  // Suggest remembered names that aren't already on the "to buy" list.
  const matches = useMemo(() => {
    const q = norm(text);
    if (!q) return [];
    const onList = new Set(toBuy.map((i) => norm(i.name)));
    const starts: string[] = [];
    const contains: string[] = [];
    for (const s of data.suggestions) {
      const n = norm(s);
      if (onList.has(n) || n === q) continue;
      if (n.startsWith(q)) starts.push(s);
      else if (n.includes(q)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, 6);
  }, [text, data.suggestions, toBuy]);

  function add(name: string) {
    const clean = name.trim();
    if (!clean) return;
    // Optimistic update so the item appears instantly.
    setData((d) => {
      const existing = d.items.find((i) => norm(i.name) === norm(clean));
      const items = existing
        ? d.items.map((i) => (i === existing ? { ...i, checked: false, updatedAt: Date.now() } : i))
        : [...d.items, { id: `tmp-${Date.now()}`, name: clean, checked: false, updatedAt: Date.now() }];
      return { ...d, items };
    });
    setText("");
    inputRef.current?.focus();
    send("/api/items", "POST", { name: clean });
  }

  function toggle(item: Item) {
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked, updatedAt: Date.now() } : i)),
    }));
    send(`/api/items/${item.id}`, "PATCH", { checked: !item.checked });
  }

  function remove(item: Item) {
    setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }));
    send(`/api/items/${item.id}`, "DELETE");
  }

  function clearDone() {
    if (!confirm("Remove all checked items?")) return;
    setData((d) => ({ ...d, items: d.items.filter((i) => !i.checked) }));
    send("/api/items", "DELETE");
  }

  return (
    <main>
      <header>
        <h1>🛒 Groceries</h1>
        <span className="count">{toBuy.length} to buy</span>
      </header>

      <form
        className="add"
        onSubmit={(e) => {
          e.preventDefault();
          add(text);
        }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Add an item…"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          maxLength={80}
        />
        <button type="submit" disabled={!text.trim()} aria-label="Add">
          +
        </button>
        {focused && matches.length > 0 && (
          <ul className="suggest">
            {matches.map((m) => (
              <li key={m}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)}>
                  {m}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <section>
        {loaded && toBuy.length === 0 && <p className="empty">Nothing to buy. Add something above.</p>}
        <ul className="list">
          {toBuy.map((i) => (
            <li key={i.id}>
              <button className="row" onClick={() => toggle(i)}>
                <span className="box" />
                <span className="name">{i.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {done.length > 0 && (
        <section className="done">
          <div className="done-head">
            <h2>Checked ({done.length})</h2>
            <button className="link" onClick={clearDone}>
              Clear all
            </button>
          </div>
          <p className="hint">Tap an item to put it back on the list.</p>
          <ul className="list">
            {done.map((i) => (
              <li key={i.id}>
                <button className="row" onClick={() => toggle(i)}>
                  <span className="box checked">✓</span>
                  <span className="name">{i.name}</span>
                  <span className="readd">↺ Re-add</span>
                </button>
                <button className="remove" onClick={() => remove(i)} aria-label={`Remove ${i.name}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
