// Skill tests: a short multiple-choice test per skill, scored here so the
// answers never reach the browser. A signed-in student who passes gets the
// skill marked verified: it shows on their account and, when they show a
// talent card, to employers. One attempt per skill a day.
//
//   GET  /tests                  -> {tests: [{slug, skill, n}]}
//   GET  /tests/mine   (session) -> {verified: [{skill, score, passed_at}], next: {slug: iso}}
//   GET  /tests/<slug>           -> {skill, pass, questions: [{id, q, code?, options}]}   options shuffled
//   POST /tests/<slug> (session) {answers: {id: option}} -> {score, of, passed, wrong: [id]}

import { user } from "./talent.js";

const PASS = 0.75;
const DAY = 86_400_000;
const refuse = (code, status) => Object.assign(new Error(code), { status, code });

// [question, answer, ...wrong options]; code is shown as a block when given
const BANK = {
  sql: { skill: "SQL", questions: [
    { q: "أي استعلام يعطي عدد الطلبات لكل عميل؟", a: "SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id",
      w: ["SELECT customer_id, COUNT(*) FROM orders", "SELECT COUNT(customer_id) FROM orders ORDER BY customer_id", "SELECT customer_id FROM orders HAVING COUNT(*)"] },
    { q: "ما الفرق بين WHERE وHAVING؟", a: "WHERE تفلتر الصفوف قبل التجميع، وHAVING تفلتر المجموعات بعده",
      w: ["لا فرق بينهما", "HAVING أسرع دائماً من WHERE", "WHERE تُستخدم مع JOIN فقط"] },
    { q: "LEFT JOIN بين customers وorders يعيد:", a: "كل العملاء، ومعهم طلباتهم إن وُجدت (وNULL لمن لا طلب له)",
      w: ["العملاء الذين لهم طلبات فقط", "كل الطلبات حتى بلا عميل", "العملاء الذين ليس لهم طلبات فقط"] },
    { q: "كم صفاً يعيد هذا الاستعلام إذا كان في الجدول 10 صفوف، 3 منها قيمة city فيها NULL؟", code: "SELECT COUNT(city) FROM users;",
      a: "صفاً واحداً قيمته 7", w: ["صفاً واحداً قيمته 10", "7 صفوف", "10 صفوف"] },
    { q: "أي دالة تعطي ترتيب كل منتج داخل فئته حسب المبيعات بلا تكرار في الأرقام؟", a: "ROW_NUMBER() OVER (PARTITION BY category ORDER BY sales DESC)",
      w: ["RANK() GROUP BY category", "COUNT(*) OVER (ORDER BY sales)", "ORDER BY category, sales"] },
    { q: "كيف تجد العملاء الذين لا طلب لهم؟", a: "LEFT JOIN مع orders ثم WHERE orders.id IS NULL",
      w: ["INNER JOIN مع orders", "WHERE orders.id = NULL", "GROUP BY customer_id HAVING COUNT(*) > 0"] },
    { q: "ماذا يفعل DISTINCT؟", a: "يحذف الصفوف المكررة من النتيجة", w: ["يرتّب النتيجة", "يحذف القيم الفارغة", "يحذف الصفوف المكررة من الجدول نفسه"] },
    { q: "أي استعلام يعطي متوسط الراتب لكل قسم، للأقسام التي متوسطها فوق 10000 فقط؟",
      a: "SELECT dept, AVG(salary) FROM staff GROUP BY dept HAVING AVG(salary) > 10000",
      w: ["SELECT dept, AVG(salary) FROM staff WHERE AVG(salary) > 10000 GROUP BY dept", "SELECT dept, salary FROM staff WHERE salary > 10000", "SELECT AVG(salary) FROM staff HAVING dept > 10000"] },
  ] },
  excel: { skill: "Excel", questions: [
    { q: "أي صيغة تجلب سعر المنتج من جدول آخر برقم المنتج؟", a: "=XLOOKUP(A2, Products!A:A, Products!C:C)",
      w: ["=SUM(Products!C:C)", "=IF(A2, Products!C:C)", "=COUNTIF(Products!A:A, A2)"] },
    { q: "ماذا يعني الرمز $ في ‎$B$2؟", a: "مرجع ثابت لا يتغيّر حين تنسخ الصيغة", w: ["عملة بالدولار", "خلية مخفية", "مجموع العمود B"] },
    { q: "أداة تلخّص آلاف الصفوف حسب القسم والشهر بسحب وإفلات:", a: "Pivot Table (الجدول المحوري)", w: ["Conditional Formatting", "Freeze Panes", "Data Validation"] },
    { q: "أي صيغة تجمع المبيعات للمنطقة \"Riyadh\" فقط؟", a: "=SUMIF(B:B, \"Riyadh\", C:C)", w: ["=SUM(C:C, \"Riyadh\")", "=COUNTIF(B:B, \"Riyadh\")", "=IF(B:B=\"Riyadh\", SUM(C:C))"] },
    { q: "صيغة VLOOKUP ترجع ‎#N/A. السبب الأرجح:", a: "القيمة المبحوث عنها غير موجودة في العمود الأول من النطاق", w: ["الملف كبير", "العمود فيه أرقام", "الورقة محمية"] },
    { q: "ماذا تعيد ‎=IFERROR(A2/B2, 0)‎ إذا كانت B2 صفراً؟", a: "0", w: ["#DIV/0!", "A2", "خطأ في الصيغة"] },
    { q: "لتمنع إدخال تاريخ خاطئ في عمود، تستخدم:", a: "Data Validation (التحقق من صحة البيانات)", w: ["Pivot Table", "Sort", "Text to Columns"] },
    { q: "‎=COUNTIFS(B:B, \"Riyadh\", C:C, \">1000\")‎ تعطي:", a: "عدد الصفوف في الرياض التي قيمتها فوق 1000", w: ["مجموع مبيعات الرياض فوق 1000", "عدد صفوف الرياض كلها", "متوسط القيم فوق 1000"] },
  ] },
  python: { skill: "Python", questions: [
    { q: "ماذا يطبع هذا الكود؟", code: "x = [1, 2, 3]\ny = x\ny.append(4)\nprint(len(x))", a: "4", w: ["3", "خطأ", "1"] },
    { q: "في pandas، كيف تقرأ ملف CSV؟", a: "pd.read_csv(\"file.csv\")", w: ["pd.open(\"file.csv\")", "pd.load_csv(\"file.csv\")", "pd.csv(\"file.csv\")"] },
    { q: "df[df[\"age\"] > 30] تعطي:", a: "الصفوف التي عمرها فوق 30", w: ["عمود age فقط", "عدد الصفوف فوق 30", "خطأ لأن الشرط يحتاج if"] },
    { q: "ما نوع النتيجة؟", code: "type({\"a\": 1})", a: "dict", w: ["list", "set", "tuple"] },
    { q: "كيف تحذف الصفوف المكررة من DataFrame؟", a: "df.drop_duplicates()", w: ["df.dropna()", "df.unique()", "df.remove_duplicates()"] },
    { q: "ماذا يطبع؟", code: "print([n * 2 for n in range(3)])", a: "[0, 2, 4]", w: ["[2, 4, 6]", "[0, 1, 2]", "6"] },
    { q: "df.groupby(\"city\")[\"sales\"].sum() تعطي:", a: "مجموع المبيعات لكل مدينة", w: ["عدد المدن", "مجموع كل المبيعات", "المدن مرتبة"] },
    { q: "أي كود يلتقط خطأ القسمة على صفر؟", a: "try:\n    x = a / b\nexcept ZeroDivisionError:\n    x = 0",
      w: ["if a / b:\n    x = 0", "catch ZeroDivisionError:\n    x = 0", "x = a / b or 0"] },
  ] },
  "power-bi": { skill: "Power BI", questions: [
    { q: "لغة كتابة المقاييس (measures) في Power BI:", a: "DAX", w: ["VBA", "SQL", "M فقط"] },
    { q: "أين تنظّف البيانات وتغيّر أنواع الأعمدة قبل تحميلها؟", a: "Power Query", w: ["Report view", "Bookmarks", "Tooltips"] },
    { q: "الفرق بين المقياس (measure) والعمود المحسوب:", a: "المقياس يُحسب حسب الفلاتر وقت العرض، والعمود يُحسب لكل صف عند التحميل",
      w: ["لا فرق", "العمود المحسوب أسرع دائماً", "المقياس يُحفظ في كل صف"] },
    { q: "أي مقياس يحسب مجموع المبيعات؟", a: "Total Sales = SUM(Sales[Amount])", w: ["Total Sales = Sales[Amount]", "Total Sales = COUNT(Sales)", "Total Sales = SUMX(Sales)"] },
    { q: "أفضل شكل لنموذج البيانات في Power BI عادة:", a: "مخطط النجمة: جدول حقائق في الوسط وجداول أبعاد حوله", w: ["جدول واحد كبير لكل شيء", "جداول بلا علاقات", "علاقات متعدد-متعدد بين كل الجداول"] },
    { q: "CALCULATE في DAX تُستخدم لـ:", a: "حساب تعبير مع تغيير سياق الفلتر", w: ["ترتيب الجداول", "استيراد البيانات", "رسم مخطط"] },
    { q: "لتقارن مبيعات هذا الشهر بنفس الشهر العام الماضي تحتاج:", a: "جدول تاريخ مرتبط ودوال ذكاء الوقت مثل SAMEPERIODLASTYEAR", w: ["عموداً نصياً للشهر", "Bookmark", "فلتر يدوي لكل سنة"] },
    { q: "Slicer في التقرير هو:", a: "فلتر مرئي يغيّر ما تعرضه الرسوم", w: ["نوع رسم بياني", "جدول بيانات", "صيغة DAX"] },
  ] },
  statistics: { skill: "Statistics", questions: [
    { q: "القيم: 2، 3، 3، 4، 100. أي مقياس يصف القيمة النموذجية أفضل؟", a: "الوسيط", w: ["المتوسط", "المدى", "أكبر قيمة"] },
    { q: "p-value = 0.03 ومستوى الدلالة 0.05 يعني:", a: "نرفض الفرضية الصفرية", w: ["نقبل الفرضية الصفرية بالتأكيد", "الفرق 3%", "النتيجة خاطئة بنسبة 3%"] },
    { q: "ارتباط قوي بين متغيرين يعني:", a: "أنهما يتحركان معاً، لا أن أحدهما يسبب الآخر بالضرورة", w: ["أن أحدهما يسبب الآخر", "أنهما متساويان", "أن العينة كبيرة"] },
    { q: "الانحراف المعياري يقيس:", a: "تشتت القيم حول المتوسط", w: ["القيمة الأكثر تكراراً", "حجم العينة", "الفرق بين أكبر وأصغر قيمة"] },
    { q: "في توزيع طبيعي، تقريباً كم من القيم تقع ضمن انحراف معياري واحد من المتوسط؟", a: "68%", w: ["50%", "95%", "99.7%"] },
    { q: "تجربة A/B: لماذا نوزّع المستخدمين عشوائياً على النسختين؟", a: "لكي يكون الفرق في النتيجة بسبب النسخة لا بسبب اختلاف المجموعتين", w: ["لتقليل عدد المستخدمين", "لأنه أسرع", "لا حاجة للعشوائية"] },
    { q: "عيّنة أكبر (مع بقاء الأشياء الأخرى كما هي) تجعل فترة الثقة:", a: "أضيق", w: ["أوسع", "كما هي", "تساوي صفراً"] },
    { q: "المنوال (mode) للقيم 1، 2، 2، 3، 4 هو:", a: "2", w: ["2.4", "3", "4"] },
  ] },
  "financial-reporting": { skill: "Financial Reporting", questions: [
    { q: "القوائم المالية الأساسية الثلاث:", a: "قائمة الدخل، الميزانية العمومية، قائمة التدفقات النقدية", w: ["الموازنة، الفواتير، الرواتب", "قائمة الدخل، الفواتير، الضرائب", "الميزانية، الرواتب، المخزون"] },
    { q: "معادلة الميزانية العمومية:", a: "الأصول = الخصوم + حقوق الملكية", w: ["الأصول = الإيرادات - المصروفات", "الخصوم = الأصول + حقوق الملكية", "حقوق الملكية = الإيرادات"] },
    { q: "صافي الربح في قائمة الدخل ينتقل إلى:", a: "الأرباح المحتجزة ضمن حقوق الملكية", w: ["الخصوم المتداولة", "النقد مباشرة", "الإيرادات"] },
    { q: "شركة باعت بضاعة آجلاً (على الحساب). حسب أساس الاستحقاق يُسجّل الإيراد:", a: "عند البيع، مع ذمة مدينة", w: ["عند استلام النقد فقط", "آخر السنة", "لا يُسجّل"] },
    { q: "الإهلاك (depreciation) هو:", a: "توزيع تكلفة الأصل الثابت على عمره الإنتاجي", w: ["نقص النقد في البنك", "خسارة بيع أصل", "مصروف ضريبي فقط"] },
    { q: "أي مما يلي أصل متداول؟", a: "الذمم المدينة", w: ["المباني", "القروض طويلة الأجل", "رأس المال"] },
    { q: "قائمة التدفقات النقدية تقسم التدفقات إلى:", a: "تشغيلية واستثمارية وتمويلية", w: ["إيرادات ومصروفات", "أصول وخصوم", "شهرية وسنوية"] },
    { q: "المعايير المحاسبية المعتمدة في السعودية للشركات المدرجة:", a: "IFRS كما اعتمدتها الهيئة السعودية للمراجعين والمحاسبين", w: ["US GAAP", "لا توجد معايير", "المعايير الضريبية فقط"] },
  ] },
};

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const TESTS = BANK;

export async function skilltests(request, env, path) {
  if (path === "/tests" && request.method === "GET") {
    return { tests: Object.entries(BANK).map(([slug, t]) => ({ slug, skill: t.skill, n: t.questions.length })), pass: PASS };
  }
  if (path === "/tests/mine" && request.method === "GET") {
    const uid = await user(request, env);
    const { results } = await env.DB.prepare("SELECT skill, score, passed_at FROM verified_skills WHERE user_id = ? ORDER BY passed_at DESC").bind(uid).all();
    const since = new Date(Date.now() - DAY).toISOString();
    const { results: tries } = await env.DB.prepare("SELECT skill, MAX(at) AS at FROM test_attempts WHERE user_id = ? AND at >= ? GROUP BY skill").bind(uid, since).all();
    const next = Object.fromEntries(tries.map((t) => [t.skill, new Date(new Date(t.at).getTime() + DAY).toISOString()]));
    return { verified: results, next };
  }
  const m = path.match(/^\/tests\/([a-z-]{2,30})$/);
  const test = m && BANK[m[1]];
  if (!test) return null;
  if (request.method === "GET") {
    return { slug: m[1], skill: test.skill, pass: PASS, questions: shuffle(test.questions.map((x, i) => ({
      id: i, q: x.q, ...(x.code ? { code: x.code } : {}), options: shuffle([x.a, ...x.w]) }))) };
  }
  if (request.method === "POST") {
    const uid = await user(request, env);
    const raw = await request.text();
    if (raw.length > 8000) throw refuse("size", 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw refuse("json", 400); }
    const now = new Date();
    const last = await env.DB.prepare("SELECT MAX(at) AS at FROM test_attempts WHERE user_id = ? AND skill = ?").bind(uid, m[1]).first();
    if (last && last.at && now - new Date(last.at) < DAY) throw refuse("wait", 429);
    const answers = input && typeof input.answers === "object" && input.answers ? input.answers : {};
    const wrong = test.questions.map((x, i) => (answers[i] === x.a ? null : i)).filter((i) => i !== null);
    const score = test.questions.length - wrong.length;
    const passed = score / test.questions.length >= PASS;
    await env.DB.prepare("INSERT INTO test_attempts (user_id, skill, at) VALUES (?, ?, ?)").bind(uid, m[1], now.toISOString()).run();
    if (passed) {
      await env.DB.prepare(`INSERT INTO verified_skills (user_id, skill, score, passed_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, skill) DO UPDATE SET score = max(score, excluded.score), passed_at = excluded.passed_at`)
        .bind(uid, test.skill, Math.round((100 * score) / test.questions.length), now.toISOString()).run();
    }
    return { score, of: test.questions.length, passed, wrong };
  }
  return null;
}
