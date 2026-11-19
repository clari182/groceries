"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type List = { id: string; name: string };
type Item = { id: string; listId: string; name: string; checked: boolean; updatedAt: number };
type Checkout = { id: string; amount: number; at: number; listId?: string };
type Suggestion = { name: string; listId?: string };
type Data = { lists: List[]; items: Item[]; suggestions: Suggestion[]; checkouts: Checkout[] };

const norm = (s: string) => s.trim().toLowerCase();
const LIST_KEY = "groceries:list";

export default function Home() {
  const [data, setData] = useState<Data>({ lists: [], items: [], suggestions: [], checkouts: [] });
  const [loaded, setLoaded] = useState(false);
  const [listId, setListId] = useState<string>("");
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [saving, setSaving] = useState(false);

  const [listsOpen, setListsOpen] = useState(false);
  const [moving, setMoving] = useState<Item | null>(null);

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
    try {
      setListId(localStorage.getItem(LIST_KEY) || "");
    } catch {}
    refresh();
    const t = setInterval(refresh, 4000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // The open list; falls back to the first one if it was deleted.
  const current = data.lists.find((l) => l.id === listId) ?? data.lists[0];
  const currentId = current?.id ?? "";

  function selectList(id: string) {
    setListId(id);
    setText("");
    try {
      localStorage.setItem(LIST_KEY, id);
    } catch {}
  }

  async function send(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json) setData(json);
    else if (json?.error) alert(json.error);
    return json;
  }

  const listItems = data.items.filter((i) => i.listId === currentId);
  const toBuy = listItems.filter((i) => !i.checked);
  const done = listItems.filter((i) => i.checked).sort((a, b) => b.updatedAt - a.updatedAt);
  const toBuyCount = (id: string) => data.items.filter((i) => i.listId === id && !i.checked).length;

  // Remembered names not already on this list, favoring ones used in this list before.
  const matches = useMemo(() => {
    const q = norm(text);
    if (!q) return [];
    const onList = new Set(toBuy.map((i) => norm(i.name)));
    const ranked = data.suggestions
      .filter((s) => {
        const n = norm(s.name);
        return !onList.has(n) && n !== q && n.includes(q);
      })
      .map((s) => ({
        name: s.name,
        score: (norm(s.name).startsWith(q) ? 0 : 2) + (s.listId === currentId ? 0 : 1),
      }));
    return ranked
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
      .map((s) => s.name);
  }, [text, data.suggestions, toBuy, currentId]);

  function add(name: string) {
    const clean = name.trim();
    if (!clean || !currentId) return;
    // Optimistic update so the item appears instantly.
    setData((d) => {
      const existing = d.items.find((i) => i.listId === currentId && norm(i.name) === norm(clean));
      const items = existing
        ? d.items.map((i) => (i === existing ? { ...i, checked: false, updatedAt: Date.now() } : i))
        : [
            ...d.items,
            { id: `tmp-${Date.now()}`, listId: currentId, name: clean, checked: false, updatedAt: Date.now() },
          ];
      return { ...d, items };
    });
    setText("");
    inputRef.current?.focus();
    send("/api/items", "POST", { name: clean, listId: currentId });
  }

  function toggle(item: Item) {
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked, updatedAt: Date.now() } : i)),
    }));
    send(`/api/items/${item.id}`, "PATCH", { checked: !item.checked });
  }

  function moveTo(item: Item, target: string) {
    setMoving(null);
    if (target === item.listId) return;
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, listId: target } : i)) }));
    send(`/api/items/${item.id}`, "PATCH", { listId: target });
  }

  function remove(item: Item) {
    setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }));
    send(`/api/items/${item.id}`, "DELETE");
  }

  function clearDone() {
    if (!confirm(`Remove all checked items from ${current?.name}?`)) return;
    setData((d) => ({ ...d, items: d.items.filter((i) => !(i.checked && i.listId === currentId)) }));
    send(`/api/items?listId=${encodeURIComponent(currentId)}`, "DELETE");
  }

  async function createList(name: string) {
    const json = await send("/api/lists", "POST", { name });
    if (json?.createdId) selectList(json.createdId);
  }

  function renameList(list: List, name: string) {
    const clean = name.trim();
    if (!clean || clean === list.name) return;
    setData((d) => ({ ...d, lists: d.lists.map((l) => (l.id === list.id ? { ...l, name: clean } : l)) }));
    send(`/api/lists/${list.id}`, "PATCH", { name: clean });
  }

  function deleteList(list: List) {
    const count = data.items.filter((i) => i.listId === list.id).length;
    const msg = count
      ? `Delete "${list.name}" and its ${count} item${count === 1 ? "" : "s"}?`
      : `Delete "${list.name}"?`;
    if (!confirm(msg)) return;
    send(`/api/lists/${list.id}`, "DELETE");
  }

  async function saveCheckout() {
    const value = Number(amount.replace(",", ".").trim());
    if (!Number.isFinite(value) || value <= 0) {
      setAmountError("Enter how much you spent, like 42.50");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, listId: currentId }),
      });
      if (!res.ok) {
        setAmountError((await res.json().catch(() => ({}))).error || "Couldn't save, try again");
        return;
      }
      setData(await res.json());
      setCheckoutOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function removeCheckout(c: Checkout) {
    if (!confirm(`Delete the ${money(c.amount)} checkout from ${formatDate(c.at)}?`)) return;
    setData((d) => ({ ...d, checkouts: d.checkouts.filter((x) => x.id !== c.id) }));
    send(`/api/checkouts/${c.id}`, "DELETE");
  }

  const listName = (id?: string) => data.lists.find((l) => l.id === id)?.name;
  const now = new Date();
  const monthTotal = data.checkouts
    .filter((c) => {
      const d = new Date(c.at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <main>
      <header>
        <h1>🛒 Groceries</h1>
        <span className="count">{toBuy.length} to buy</span>
      </header>

      <nav className="tabs" aria-label="Lists">
        {data.lists.map((l) => {
          const n = toBuyCount(l.id);
          return (
            <button
              key={l.id}
              className={l.id === currentId ? "tab active" : "tab"}
              onClick={() => selectList(l.id)}
              aria-current={l.id === currentId ? "page" : undefined}
            >
              {l.name}
              {n > 0 && <span className="badge">{n}</span>}
            </button>
          );
        })}
        <button className="tab ghost" onClick={() => setListsOpen(true)}>
          Edit lists
        </button>
      </nav>

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
          placeholder={current ? `Add to ${current.name}…` : "Add an item…"}
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
        {loaded && toBuy.length === 0 && <p className="empty">Nothing to buy here. Add something above.</p>}
        <ul className="list">
          {toBuy.map((i) => (
            <li key={i.id}>
              <button className="row" onClick={() => toggle(i)}>
                <span className="box" />
                <span className="name">{i.name}</span>
              </button>
              {data.lists.length > 1 && (
                <button className="remove move" onClick={() => setMoving(i)} aria-label={`Move ${i.name} to another list`}>
                  ⇄
                </button>
              )}
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

      {data.checkouts.length > 0 && (
        <section className="done spending">
          <div className="done-head">
            <h2>Spending</h2>
            <span className="month">This month: {money(monthTotal)}</span>
          </div>
          <ul className="list">
            {data.checkouts.map((c) => (
              <li key={c.id}>
                <div className="row static">
                  <span className="when">
                    {formatDate(c.at)}
                    {listName(c.listId) && <span className="tag">{listName(c.listId)}</span>}
                  </span>
                  <span className="amount">{money(c.amount)}</span>
                </div>
                <button className="remove" onClick={() => removeCheckout(c)} aria-label="Delete checkout">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="checkout-bar">
        <button
          onClick={() => {
            setAmount("");
            setAmountError("");
            setCheckoutOpen(true);
          }}
        >
          Checkout{current ? ` · ${current.name}` : ""}
        </button>
      </div>

      {checkoutOpen && (
        <Sheet onClose={() => !saving && setCheckoutOpen(false)} labelledBy="checkout-title">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveCheckout();
            }}
          >
            <h3 id="checkout-title">How much did you spend{current ? ` at ${current.name}` : ""}?</h3>
            <input
              className="big"
              autoFocus
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountError("");
              }}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Total spent"
              enterKeyHint="done"
            />
            {amountError && <p className="error">{amountError}</p>}
            <p className="hint">Saved with today&apos;s date and time.</p>
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={() => setCheckoutOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={saving || !amount.trim()}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {moving && (
        <Sheet onClose={() => setMoving(null)} labelledBy="move-title">
          <h3 id="move-title">Move “{moving.name}” to…</h3>
          <div className="choices">
            {data.lists
              .filter((l) => l.id !== moving.listId)
              .map((l) => (
                <button key={l.id} className="secondary" onClick={() => moveTo(moving, l.id)}>
                  {l.name}
                </button>
              ))}
          </div>
          <div className="sheet-actions">
            <button className="secondary" onClick={() => setMoving(null)}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}

      {listsOpen && (
        <ListsSheet
          lists={data.lists}
          onClose={() => setListsOpen(false)}
          onCreate={createList}
          onRename={renameList}
          onDelete={deleteList}
        />
      )}
    </main>
  );
}

function Sheet({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ListsSheet({
  lists,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: {
  lists: List[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (list: List, name: string) => void;
  onDelete: (list: List) => void;
}) {
  const [newName, setNewName] = useState("");
  return (
    <Sheet onClose={onClose} labelledBy="lists-title">
      <h3 id="lists-title">Your lists</h3>
      <ul className="edit-lists">
        {lists.map((l) => (
          <li key={l.id}>
            <input
              defaultValue={l.name}
              aria-label={`Rename ${l.name}`}
              maxLength={40}
              enterKeyHint="done"
              onBlur={(e) => {
                if (!e.target.value.trim()) e.target.value = l.name;
                else onRename(l, e.target.value);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <button
              className="remove"
              onClick={() => onDelete(l)}
              disabled={lists.length <= 1}
              aria-label={`Delete ${l.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="new-list"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          onCreate(newName.trim());
          setNewName("");
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New list, e.g. Pharmacy"
          maxLength={40}
          enterKeyHint="done"
        />
        <button type="submit" className="primary" disabled={!newName.trim()}>
          Add
        </button>
      </form>
      <p className="hint">Tap a name to rename it. Deleting a list also deletes its items.</p>
      <div className="sheet-actions">
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
