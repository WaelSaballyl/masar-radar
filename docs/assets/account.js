// The account page: "Continue with Google", then the signed-in view with sync,
// sign out and delete. Google's button comes from Google Identity Services;
// its answer (an ID token) goes straight to the worker, which checks it.
(() => {
  "use strict";
  const { account, el } = Masar;
  const $ = (id) => document.getElementById(id);
  Masar.initTheme();

  const ERRORS = {
    token: "تعذّر التحقق من حساب قوقل. جرّب مرة ثانية.",
    rate: "محاولات كثيرة. انتظر قليلاً ثم جرّب.",
    off: "تسجيل الدخول غير مفعّل بعد. الموقع كله يشتغل بدونه.",
  };
  const status = (text) => { $("status").textContent = text || ""; };

  function show() {
    const u = account.user;
    $("signed-out").hidden = !!u;
    $("signed-in").hidden = !u;
    Masar.accountButton();
    if (!u) { google(); return; }
    $("who-name").textContent = u.name || u.email;
    $("who-email").textContent = u.email;
    const avatar = $("avatar");
    avatar.replaceChildren((u.name || u.email).trim().charAt(0).toUpperCase());
    if (/^https:\/\//.test(u.picture || "")) {
      const img = document.createElement("img");
      img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onload = () => avatar.replaceChildren(img);
      img.src = u.picture;
    }
    syncState("متزامن. أي تغيير هنا يصل لأجهزتك الأخرى خلال ثوانٍ.");
    fillMe();
    talent();
  }

  // ---------- the profile: CV fields in masar.profile, the rest in masar.me ----------
  // masar.me holds what the CV builder has no field for (country, target role),
  // since the builder rewrites masar.profile with its own fields only.
  const read = (k) => { try { return JSON.parse(Masar.store.get(k) || "{}") || {}; } catch { return {}; } };
  const form = $("me");
  function fillMe() {
    const src = { profile: read("masar.profile"), me: read("masar.me") };
    [...form.elements].forEach((f) => {
      if (!f.name || !f.dataset.src) return;
      const v = src[f.dataset.src][f.name];
      if (f.type === "checkbox") f.checked = !!v;
      else f.value = typeof v === "string" ? v : "";
    });
    const cvs = (() => { try { return JSON.parse(Masar.store.get("masar.cvs") || "[]"); } catch { return []; } })();
    const p = src.profile;
    $("cv-state").textContent = cvs.length
      ? `السير المحفوظة: ${cvs.length}. آخرها لإعلان ${cvs[0].label || ""}.`
      : p.experience || p.skills ? "معلوماتك موجودة. جهّز منها سيرة لأي إعلان." : "لم ترفع سيرتك بعد. ارفعها مرة وتُقرأ تلقائياً.";
  }
  let saveTimer = null;
  form.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const profile = read("masar.profile"), me = read("masar.me");
      [...form.elements].forEach((f) => {
        if (!f.name || !f.dataset.src) return;
        const target = f.dataset.src === "me" ? me : profile;
        target[f.name] = f.type === "checkbox" ? f.checked : f.value.trim();
      });
      Masar.store.set("masar.profile", JSON.stringify(profile));
      Masar.store.set("masar.me", JSON.stringify(me));
      $("me-status").textContent = "حُفظ.";
      setTimeout(() => { $("me-status").textContent = ""; }, 1500);
    }, 400);
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  // ---------- the opt-in card employers can find, and their invitations ----------
  const cardFrom = () => {
    const p = read("masar.profile"), me = read("masar.me");
    // the field follows the target role when it names one, like the radar does
    return { target: me.target, country: me.country, seeking: me.seeking, relocate: me.relocate, field: me.field || "data",
             city: p.city, university: p.university, major: p.major, degree: p.degree, graduation: p.graduation, skills: p.skills };
  };
  async function talent() {
    const r = await account.call("/talent/mine").catch(() => null);
    if (!r || r.status !== 200) return;
    $("talent-on").checked = !!r.card;
    $("invites-box").hidden = !r.invites.length;
    $("invites").replaceChildren(...r.invites.map((i) => {
      const li = el("li");
      const a = el("a", "ticket-row");
      a.href = `job.html?ex=${encodeURIComponent(i.id)}`;
      a.append(el("strong", null, `${i.title}، ${i.company}`), el("span", "badge-new", "دعتك للتقديم"));
      li.append(a);
      return li;
    }));
  }
  $("talent-on").addEventListener("change", async (e) => {
    const on = e.target.checked;
    $("talent-status").textContent = "…";
    const r = on ? await account.call("/talent", { card: cardFrom() }).catch(() => null)
                 : await account.call("/talent/hide", {}).catch(() => null);
    if (r && r.status === 200) $("talent-status").textContent = on ? "بطاقتك ظاهرة للشركات. تتحدّث حين تعدّل ملفك." : "أخفينا بطاقتك.";
    else {
      e.target.checked = !on;
      $("talent-status").textContent = r && r.error === "field:skills" ? "أضف مهاراتك أو تخصصك في ملفك أولاً." : "تعذّر الحفظ. جرّب بعد قليل.";
    }
  });
  // a shown card follows the profile as it is edited
  let cardTimer = null;
  form.addEventListener("input", () => {
    if (!$("talent-on").checked) return;
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => account.call("/talent", { card: cardFrom() }).catch(() => {}), 2000);
  });
  const syncState = (text) => { $("sync-state").textContent = text; };

  // Google's script is loaded only on this page, and only when signed out
  let loaded = null;
  async function google() {
    try {
      const { google: clientId } = await fetch(`${account.api}/auth/config`).then((r) => r.json());
      if (!clientId) { status(ERRORS.off); return; }
      loaded = loaded || new Promise((ok, fail) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true; s.onload = ok; s.onerror = fail;
        document.head.append(s);
      });
      await loaded;
      window.google.accounts.id.initialize({ client_id: clientId, callback: signIn, ux_mode: "popup", context: "signin" });
      window.google.accounts.id.renderButton($("google-btn"), {
        theme: "filled_black", size: "large", shape: "pill", text: "continue_with", locale: Masar.store.get("masar.lang") === "en" ? "en" : "ar", width: 320, logo_alignment: "left",
      });
    } catch {
      status("تعذّر تحميل زر قوقل. تأكد من الاتصال وحدّث الصفحة.");
    }
  }

  async function signIn({ credential }) {
    status("جارٍ تسجيل الدخول…");
    try {
      const r = await fetch(`${account.api}/auth/google`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }),
      });
      const out = await r.json();
      if (!r.ok) { status(ERRORS[out.error] || ERRORS.token); return; }
      status("");
      await account.signedIn(out.token, out.user).catch(() => {});
      show();
    } catch {
      status("تعذّر الاتصال. جرّب مرة ثانية.");
    }
  }

  $("sync-now").onclick = async () => {
    syncState("جارٍ المزامنة…");
    localStorage.setItem("masar.syncDirty", "1");
    try { await account.sync(); syncState("تمت المزامنة الآن."); }
    catch (e) { if (e.status === 401) show(); else syncState("تعذّرت المزامنة. جرّب بعد قليل."); }
  };
  $("sign-out").onclick = async () => {
    await account.call("/auth/logout", {}).catch(() => {});
    account.forget();
    window.google?.accounts.id.disableAutoSelect();
    show();
  };
  $("delete").onclick = async () => {
    if (!confirm("متأكد؟ يُحذف حسابك وكل ما حُفظ له عندنا، ولا يمكن التراجع.")) return;
    const b = $("delete");
    b.disabled = true;
    try {
      const out = await account.call("/auth/delete", {});
      if (out.status !== 200) throw new Error("delete");
      account.forget();
      show();
      status("حُذف حسابك وكل بياناته عندنا.");
    } catch {
      b.disabled = false;
      b.after(el("p", "status bad", "تعذّر الحذف الآن. جرّب بعد قليل."));
    }
  };

  // a session that expired on the worker shows the sign-in again
  if (account.token) account.call("/auth/me").catch(() => show());
  show();
})();
