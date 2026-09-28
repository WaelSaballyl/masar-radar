// Support conversations. Each ticket's id and token are kept in this browser
// (masar.tickets, synced to the account when signed in); the page shows them
// as a list, opens one as a chat, and checks for the team's replies every
// 10 seconds while a chat is open and the tab is visible.
(() => {
  "use strict";
  const { el, store, account } = Masar;
  const $ = (id) => document.getElementById(id);
  const API = document.querySelector('meta[name="masar-api"]').content;
  Masar.initTheme();

  const KEY = "masar.tickets";
  const TOPIC = { account: "حسابي وتسجيل الدخول", cv: "صانع السيرة", apply: "التقديم وطلباتي",
                  employer: "أنا شركة", bug: "شي ما يشتغل", other: "غير ذلك" };
  const ERR = { "field:name": "اكتب اسمك.", "field:email": "إيميلك غير صحيح.", "field:text": "اكتب رسالتك بجملة على الأقل.",
                rate: "رسائل كثيرة. انتظر قليلاً ثم جرّب.", size: "الرسالة طويلة جداً." };
  const tickets = () => { try { return JSON.parse(store.get(KEY) || "[]"); } catch { return []; } };
  const keep = (list) => store.set(KEY, JSON.stringify(list));

  const call = (path, token, body) => fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
               ...(account.token ? { "X-Masar-Session": account.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

  const when = (iso) => new Date(iso).toLocaleString("ar-SA-u-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  // ---------- views: list, new form, one chat ----------
  let open = null, timer = null;
  function view(name) {
    $("tickets").hidden = name !== "list";
    $("ticket-form").hidden = name !== "form";
    $("chat").hidden = name !== "chat";
    $("new-chat").hidden = name !== "list";
    $("cancel-new").hidden = !(name === "form" && tickets().length);
    if (name !== "chat") { open = null; clearInterval(timer); }
  }

  function list() {
    const all = tickets();
    if (!all.length) { prefill(); view("form"); return; }
    $("tickets").replaceChildren(...all.slice().reverse().map((t) => {
      const li = el("li");
      const b = el("button", "ticket-row");
      b.type = "button";
      b.append(el("strong", null, TOPIC[t.topic] || TOPIC.other), el("span", "muted", when(t.created)));
      b.onclick = () => chat(t);
      li.append(b);
      return li;
    }));
    view("list");
  }

  function prefill() {
    const f = $("ticket-form");
    const u = account.user;
    let p = {};
    try { p = JSON.parse(store.get("masar.profile") || "{}"); } catch { /* a damaged copy */ }
    if (!f.elements.name.value) f.elements.name.value = (u && u.name) || p.name || "";
    if (!f.elements.email.value) f.elements.email.value = (u && u.email) || p.email || "";
  }

  async function chat(t) {
    open = t;
    view("chat");
    $("chat-topic").textContent = TOPIC[t.topic] || TOPIC.other;
    $("bubbles").replaceChildren(el("li", "muted", "جارٍ التحميل…"));
    await refresh();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) refresh(); }, 10_000);
    $("chat-text").focus();
  }

  let shown = -1;
  async function refresh() {
    if (!open) return;
    const t = open;
    const r = await call(`/support/tickets/${t.id}`, t.token).catch(() => null);
    if (open !== t) return;
    if (!r || !r.ok) { $("bubbles").replaceChildren(el("li", "muted", "تعذّر تحميل المحادثة. جرّب بعد قليل.")); return; }
    const { messages, ticket } = r.data;
    if (messages.length === shown) return;
    shown = messages.length;
    const items = messages.map((m) => {
      const li = el("li", `bubble ${m.author === "team" ? "from-team" : "from-me"}`);
      const p = el("p", null, m.text);
      p.dir = "auto";
      li.append(el("span", "bubble-who", m.author === "team" ? "فريق مسار" : "أنت"), p, el("time", null, when(m.created_at)));
      return li;
    });
    if (!messages.some((m) => m.author === "team")) {
      items.push(el("li", "bubble-note", "وصلتنا رسالتك. نرد عادة خلال يوم عمل، ويظهر الرد هنا."));
    }
    if (ticket.status === "closed") items.push(el("li", "bubble-note", "أُغلقت هذه المحادثة. اكتب رسالة إذا احتجت شيئاً آخر وتنفتح من جديد."));
    $("bubbles").replaceChildren(...items);
    $("bubbles").lastElementChild?.scrollIntoView({ block: "nearest" });
  }

  // ---------- actions ----------
  $("ticket-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const b = f.querySelector("[type=submit]");
    const input = { name: f.elements.name.value, email: f.elements.email.value, topic: f.elements.topic.value, text: f.elements.text.value };
    b.disabled = true;
    $("form-status").textContent = "جارٍ الإرسال…";
    const r = await call("/support/tickets", null, input).catch(() => null);
    b.disabled = false;
    if (!r || !r.ok) { $("form-status").textContent = ERR[r && r.data.error] || "تعذّر الإرسال. جرّب بعد قليل."; return; }
    $("form-status").textContent = "";
    f.elements.text.value = "";
    const t = { id: r.data.id, token: r.data.token, topic: input.topic, created: new Date().toISOString() };
    keep([...tickets(), t]);
    shown = -1;
    chat(t);
  });

  $("chat-send").addEventListener("submit", async (e) => {
    e.preventDefault();
    const box = $("chat-text"), text = box.value.trim();
    if (!text || !open) return;
    box.disabled = true;
    const r = await call(`/support/tickets/${open.id}`, open.token, { text }).catch(() => null);
    box.disabled = false;
    if (r && r.ok) { box.value = ""; await refresh(); box.focus(); }
    else $("bubbles").append(el("li", "bubble-note", ERR[r && r.data.error] || "لم تُرسل الرسالة. جرّب مرة ثانية."));
  });
  $("chat-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chat-send").requestSubmit(); }
  });
  $("new-chat").onclick = () => { prefill(); view("form"); };
  $("cancel-new").onclick = list;
  $("back").onclick = () => { shown = -1; list(); };

  // ---------- the assistant: instant answers from what the site does ----------
  $("ask-bot").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("ask-q").value.trim();
    if (q.length < 3) return;
    const b = e.target.querySelector("[type=submit]");
    b.disabled = true;
    $("bot-answer").hidden = false;
    $("bot-text").textContent = "…";
    const r = await call("/support/ask", null, { q }).catch(() => null);
    b.disabled = false;
    $("bot-text").textContent = r && r.ok ? r.data.answer
      : r && r.status === 429 ? ERR.rate : "المساعد مشغول الآن. اكتب للفريق وسنرد عليك.";
  });
  $("bot-human").onclick = () => {
    prefill();
    const f = $("ticket-form");
    if (!f.elements.text.value) f.elements.text.value = $("ask-q").value.trim();
    view("form");
    f.elements.text.focus();
  };

  list();
})();
