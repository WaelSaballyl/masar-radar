// Skill tests: a short multiple-choice test per skill, scored here so the
// answers never reach the browser. A signed-in student who passes gets the
// skill marked verified: it shows on their account and, when they show a
// talent card, to employers. One attempt per skill a day.
//
//   GET  /tests                  -> {tests: [{slug, skill, n, bank}]}
//   GET  /tests/mine   (session) -> {verified: [{skill, score, passed_at}], next: {slug: iso}}
//   GET  /tests/<slug>           -> {skill, pass, day, questions: [{id, q, code?, options}]}   options shuffled
//   POST /tests/<slug> (session) {answers: {id: option}, day} -> {score, of, passed, wrong: [id]}
//
// Each attempt is ROUND questions out of a bank of 20+. A signed-in student
// gets the same ROUND for a skill all day (picked from a hash of their id, the
// skill and the date), so loading the test again cannot shop for easier
// questions; tomorrow's attempt is a different set. Scoring recomputes that set,
// so answers to questions that were not asked count for nothing.

import { user } from "./talent.js";
import { refuse, body, sha } from "./util.js";

const PASS = 0.75;
export const ROUND = 8;
const DAY = 86_400_000;

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
    { q: "أي أمر يضيف صفاً جديداً إلى جدول؟", a: "INSERT INTO", w: ["UPDATE", "ALTER TABLE", "ADD ROW"] },
    { q: "ماذا يفعل هذا الاستعلام؟", code: "UPDATE staff SET salary = salary * 1.1 WHERE dept = 'IT';", a: "يرفع رواتب قسم IT بنسبة 10%", w: ["يرفع كل الرواتب 10%", "يضيف موظفاً جديداً لقسم IT", "يعرض رواتب قسم IT بعد الزيادة دون تغييرها"] },
    { q: "أي شرط يجد الأسماء التي تبدأ بحرف A؟", a: "WHERE name LIKE 'A%'", w: ["WHERE name = 'A%'", "WHERE name LIKE '%A'", "WHERE name IN ('A')"] },
    { q: "ما المفتاح الأساسي (Primary Key)؟", a: "عمود (أو أكثر) يحدد كل صف بقيمة فريدة غير فارغة", w: ["أول عمود في الجدول دائماً", "عمود يربط جدولين فقط", "عمود يُرتّب به الجدول"] },
    { q: "ماذا يعيد INNER JOIN بين orders وcustomers؟", a: "الطلبات التي لها عميل مطابق فقط", w: ["كل الطلبات وكل العملاء", "العملاء بلا طلبات", "كل الطلبات حتى بلا عميل"] },
    { q: "أي استعلام يعطي أعلى 5 منتجات مبيعاً؟", a: "SELECT product, SUM(qty) AS total FROM sales GROUP BY product ORDER BY total DESC LIMIT 5", w: ["SELECT TOP product FROM sales LIMIT 5", "SELECT product FROM sales ORDER BY qty LIMIT 5", "SELECT product, MAX(qty) FROM sales LIMIT 5"] },
    { q: "كيف تعرض النص 'غير متوفر' بدل القيم الفارغة في عمود phone؟", a: "COALESCE(phone, 'غير متوفر')", w: ["IF(phone, 'غير متوفر')", "phone = NULL OR 'غير متوفر'", "REPLACE(NULL, 'غير متوفر')"] },
    { q: "الفرق بين UNION وUNION ALL:", a: "UNION يحذف الصفوف المكررة، وUNION ALL يُبقيها", w: ["UNION ALL يحذف المكرر", "لا فرق بينهما", "UNION يضع الأعمدة جنباً إلى جنب"] },
    { q: "أي أمر يحذف كل صفوف الجدول ويُبقي الجدول نفسه؟", a: "DELETE FROM orders", w: ["DROP TABLE orders", "DELETE orders TABLE", "REMOVE * FROM orders"] },
    { q: "ما فائدة الفهرس (Index)؟", a: "تسريع البحث والفلترة على العمود المفهرس", w: ["منع القيم المكررة في كل الحالات", "ضغط حجم الجدول", "ترتيب الصفوف عند العرض"] },
    { q: "CASE WHEN في SQL تُستخدم لـ:", a: "إرجاع قيمة حسب شرط داخل الاستعلام، مثل تصنيف المبيعات إلى عالية ومنخفضة", w: ["ربط جدولين", "إنشاء جدول جديد", "تكرار الاستعلام في حلقة"] },
    { q: "أي تعبير يعطي عدد العملاء المختلفين في جدول الطلبات؟", a: "COUNT(DISTINCT customer_id)", w: ["COUNT(customer_id)", "DISTINCT COUNT(*)", "SUM(DISTINCT customer_id)"] },
    { q: "ماذا تعني NULL؟", a: "قيمة غير معروفة أو غير موجودة، ليست صفراً ولا نصاً فارغاً", w: ["صفر", "نص فارغ", "خطأ في الجدول"] },
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
    { q: "أي صيغة تعطي عدد الخلايا غير الفارغة في A1:A100؟", a: "=COUNTA(A1:A100)", w: ["=COUNT(A1:A100)", "=COUNTBLANK(A1:A100)", "=SUM(A1:A100)"] },
    { q: "ماذا تعيد ‎=LEFT(\"Riyadh\", 3)‎؟", a: "Riy", w: ["dh", "adh", "Riyadh"] },
    { q: "لتجمع الاسم الأول في A2 والأخير في B2 بمسافة بينهما:", a: "=A2 & \" \" & B2", w: ["=A2 + B2", "=SUM(A2, B2)", "=A2, B2"] },
    { q: "ماذا يفعل Freeze Panes؟", a: "يُبقي صفوفاً أو أعمدة ظاهرة أثناء التمرير", w: ["يمنع تعديل الخلايا", "يخفي الصفوف", "يحسب الصيغ تلقائياً"] },
    { q: "تريد تلوين الخلايا التي قيمتها فوق 1000 تلقائياً. تستخدم:", a: "Conditional Formatting (التنسيق الشرطي)", w: ["Data Validation", "Pivot Table", "Find & Replace"] },
    { q: "ماذا تعيد ‎=IF(B2>=60, \"ناجح\", \"راسب\")‎ إذا كانت B2 تساوي 60؟", a: "ناجح", w: ["راسب", "FALSE", "#VALUE!"] },
    { q: "أي صيغة تعطي متوسط المبيعات في C2:C50؟", a: "=AVERAGE(C2:C50)", w: ["=MEAN(C2:C50)", "=SUM(C2:C50)/2", "=MEDIAN(C2:C50)"] },
    { q: "لتفصل \"أحمد,الرياض\" المكتوبة في خلية واحدة إلى عمودين:", a: "Text to Columns بفاصل الفاصلة", w: ["Merge & Center", "Wrap Text", "Remove Duplicates"] },
    { q: "‎=TODAY()‎ تعيد:", a: "تاريخ اليوم، ويتحدّث كل يوم", w: ["تاريخ إنشاء الملف", "الوقت الحالي فقط", "تاريخاً ثابتاً لا يتغيّر"] },
    { q: "عند نسخ الصيغة يميناً، ما الفرق بين المرجع A2 و‎$A2‎؟", a: "‎$A2‎ يُبقي العمود A ثابتاً، وA2 يصير B2", w: ["لا فرق", "‎$A2‎ يُبقي الصف 2 ثابتاً فقط", "A2 يبقى ثابتاً"] },
    { q: "أي صيغة تعطي أكبر قيمة في D2:D200؟", a: "=MAX(D2:D200)", w: ["=LARGE(D2:D200)", "=TOP(D2:D200)", "=HIGH(D2:D200)"] },
    { q: "لإزالة الصفوف المكررة من قائمة عملاء:", a: "Data ثم Remove Duplicates", w: ["Sort A to Z", "Freeze Panes", "Conditional Formatting"] },
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
    { q: "ماذا يطبع هذا الكود؟", code: "print(10 // 3)", a: "3", w: ["3.33", "3.0", "1"] },
    { q: "ماذا يطبع هذا الكود؟", code: "print(\"abc\"[::-1])", a: "cba", w: ["abc", "a", "خطأ"] },
    { q: "ماذا يطبع هذا الكود؟", code: "print(len(\"مسار\"))", a: "4", w: ["2", "8", "1"] },
    { q: "أي سطر يضيف عنصراً إلى نهاية القائمة items؟", a: "items.append(x)", w: ["items.add(x)", "items.push(x)", "items.insert(x)"] },
    { q: "ماذا يطبع هذا الكود؟", code: "d = {\"a\": 1}\nprint(d.get(\"b\", 0))", a: "0", w: ["None", "خطأ KeyError", "1"] },
    { q: "في pandas، كيف ترى أول 5 صفوف؟", a: "df.head()", w: ["df.top()", "df.first5()", "df.show(5)"] },
    { q: "df.isna().sum() تعطي:", a: "عدد القيم الفارغة في كل عمود", w: ["مجموع كل الأعمدة", "عدد الصفوف", "الصفوف الفارغة فقط"] },
    { q: "كيف تملأ القيم الفارغة في عمود price بصفر؟", a: "df[\"price\"] = df[\"price\"].fillna(0)", w: ["df[\"price\"].dropna(0)", "df[\"price\"] = 0", "df.fill(\"price\", 0)"] },
    { q: "ماذا يطبع هذا الكود؟", code: "x = 5\nif x > 3:\n    print(\"big\")\nelse:\n    print(\"small\")", a: "big", w: ["small", "big small", "لا شيء"] },
    { q: "ما الفرق بين list وtuple؟", a: "القائمة تقبل التعديل، والـ tuple لا تتغيّر بعد إنشائها", w: ["لا فرق", "الـ tuple أسرع في إضافة العناصر", "القائمة لا تقبل التكرار"] },
    { q: "df.merge(customers, on=\"customer_id\") تفعل:", a: "تربط جدولين بعمود مشترك، مثل JOIN في SQL", w: ["تضع الصفوف تحت بعضها", "تحذف العمود المشترك", "ترتّب الجدول"] },
    { q: "ماذا يطبع هذا الكود؟", code: "nums = [3, 1, 2]\nprint(sorted(nums))", a: "[1, 2, 3]", w: ["[3, 1, 2]", "[3, 2, 1]", "None"] },
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
    { q: "ما الذي يحدد اتجاه انتقال الفلتر بين جدولين مرتبطين؟", a: "اتجاه الفلترة في العلاقة (Cross filter direction)", w: ["لون الجدول", "ترتيب الأعمدة", "حجم الجدول"] },
    { q: "لماذا ‎DIVIDE(A, B)‎ أفضل من ‎A / B‎ في DAX؟", a: "لأنها تتعامل مع القسمة على صفر بدل أن تعطي خطأ", w: ["لأنها أسرع بعشر مرات دائماً", "لأنها تقرّب الناتج تلقائياً", "لأنها تعمل مع النصوص"] },
    { q: "أين تنشر التقرير لتشاركه مع فريقك؟", a: "Power BI Service", w: ["Power Query", "DAX Studio", "ملف Excel"] },
    { q: "أي رسم يناسب عرض المبيعات عبر الأشهر؟", a: "رسم خطي (Line chart)", w: ["رسم دائري (Pie chart)", "بطاقة (Card)", "خريطة"] },
    { q: "علاقة جدول المنتجات بجدول المبيعات عادة:", a: "واحد إلى متعدد: للمنتج الواحد مبيعات كثيرة", w: ["واحد إلى واحد", "متعدد إلى متعدد دائماً", "لا علاقة بينهما"] },
    { q: "Card visual يُستخدم لعرض:", a: "رقم واحد مهم مثل إجمالي المبيعات", w: ["جدول كامل", "خريطة", "سلسلة زمنية"] },
    { q: "تريد أن يرى كل مدير منطقته فقط في التقرير نفسه. الطريقة الصحيحة:", a: "Row-Level Security (أمان على مستوى الصفوف)", w: ["Bookmarks", "Slicer مخفي", "نسخة تقرير لكل مدير"] },
    { q: "التحديث المجدول (Scheduled refresh) في Power BI Service يعني:", a: "تحديث بيانات التقرير تلقائياً في أوقات محددة", w: ["إعادة تصميم التقرير", "حذف البيانات القديمة", "إرسال التقرير بالبريد"] },
    { q: "‎COUNTROWS(Sales)‎ تعطي:", a: "عدد صفوف جدول المبيعات حسب الفلاتر الحالية", w: ["مجموع المبيعات", "عدد الأعمدة", "عدد الجداول"] },
    { q: "Drill down في الرسم يعني:", a: "النزول من مستوى أعلى إلى أدق، مثل من السنة إلى الشهر", w: ["حذف البيانات", "تصدير الرسم", "تغيير لون الرسم"] },
    { q: "في Power Query، لتحويل أعمدة الأشهر (يناير، فبراير...) إلى صفوف تستخدم:", a: "Unpivot Columns", w: ["Pivot Column", "Merge Queries", "Group By"] },
    { q: "‎RELATED()‎ في عمود محسوب تُستخدم لـ:", a: "جلب قيمة من الجدول المرتبط على جهة \"الواحد\" في العلاقة", w: ["إنشاء علاقة جديدة", "حذف علاقة", "حساب المتوسط"] },
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
    { q: "متوسط القيم 4، 6، 8 هو:", a: "6", w: ["8", "18", "4"] },
    { q: "الوسيط للقيم 7، 1، 5، 3 هو:", a: "4", w: ["5", "3", "4.5"] },
    { q: "عند رمي عملة عادلة مرتين، احتمال ظهور الكتابة في المرتين:", a: "0.25", w: ["0.5", "0.75", "1"] },
    { q: "الخطأ من النوع الأول (Type I) هو:", a: "رفض الفرضية الصفرية وهي صحيحة", w: ["قبول الفرضية الصفرية وهي خاطئة", "خطأ في جمع البيانات", "خطأ في الحساب"] },
    { q: "القيمة الشاذة (outlier) تؤثر أكثر على:", a: "المتوسط", w: ["الوسيط", "المنوال", "عدد القيم"] },
    { q: "معامل ارتباط بيرسون ‎-0.9‎ يعني:", a: "علاقة عكسية قوية", w: ["علاقة طردية قوية", "لا علاقة", "علاقة عكسية ضعيفة"] },
    { q: "استطلاع 100 موظف من قسم واحد لتعميم النتيجة على الشركة كلها. المشكلة:", a: "العيّنة لا تمثّل الشركة (تحيّز في الاختيار)", w: ["العيّنة كبيرة جداً", "لا مشكلة", "يجب أن تكون العيّنة 50 فقط"] },
    { q: "المدى (range) للقيم 3، 9، 4، 12 هو:", a: "9", w: ["12", "7", "3"] },
    { q: "التباين (variance) هو:", a: "مربع الانحراف المعياري", w: ["الجذر التربيعي للمتوسط", "الفرق بين أكبر وأصغر قيمة", "نصف المتوسط"] },
    { q: "متى تستخدم المدرّج التكراري (histogram)؟", a: "لرؤية توزيع قيم متغير رقمي", w: ["لمقارنة أجزاء من كل", "لعرض علاقة متغيرين", "لعرض بيانات نصية"] },
    { q: "فترة ثقة 95% لمتوسط الراتب [8000، 9000] تعني تقريباً:", a: "لو كررنا أخذ العينات، فإن 95% من الفترات المحسوبة بهذه الطريقة تحتوي المتوسط الحقيقي", w: ["95% من الموظفين رواتبهم بين 8000 و9000", "المتوسط الحقيقي 8500 بالتأكيد", "5% من الرواتب خاطئة"] },
    { q: "احتمال حدث مستحيل يساوي:", a: "0", w: ["1", "0.5", "-1"] },
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
    { q: "الإيرادات 500 ألف والمصروفات 380 ألف. صافي الربح:", a: "120 ألف", w: ["880 ألف", "380 ألف", "500 ألف"] },
    { q: "الذمم الدائنة (accounts payable) هي:", a: "مبالغ مستحقة على الشركة للموردين", w: ["مبالغ للشركة عند العملاء", "نقد في البنك", "أرباح موزعة"] },
    { q: "شراء معدّات بالنقد يظهر في قائمة التدفقات النقدية ضمن:", a: "الأنشطة الاستثمارية", w: ["الأنشطة التشغيلية", "الأنشطة التمويلية", "لا يظهر فيها"] },
    { q: "سداد قرض بنكي يظهر في قائمة التدفقات النقدية ضمن:", a: "الأنشطة التمويلية", w: ["الأنشطة التشغيلية", "الأنشطة الاستثمارية", "قائمة الدخل كمصروف"] },
    { q: "هامش الربح الإجمالي يساوي:", a: "(الإيرادات - تكلفة المبيعات) ÷ الإيرادات", w: ["صافي الربح ÷ الأصول", "الإيرادات ÷ تكلفة المبيعات", "تكلفة المبيعات ÷ الإيرادات"] },
    { q: "نسبة التداول (current ratio) تساوي:", a: "الأصول المتداولة ÷ الخصوم المتداولة", w: ["الخصوم ÷ حقوق الملكية", "صافي الربح ÷ الإيرادات", "النقد ÷ الأصول الثابتة"] },
    { q: "دفعت الشركة اليوم إيجار سنة كاملة مقدماً. يُسجّل أولاً:", a: "أصلاً (مصروف مدفوع مقدماً) يتحوّل مصروفاً شهراً بشهر", w: ["مصروفاً كاملاً اليوم", "خصماً على الشركة", "إيراداً"] },
    { q: "نسبة ضريبة القيمة المضافة في السعودية حالياً:", a: "15%", w: ["5%", "10%", "20%"] },
    { q: "الجهة التي تحصّل الزكاة في السعودية:", a: "هيئة الزكاة والضريبة والجمارك", w: ["وزارة الموارد البشرية", "البنك المركزي", "هيئة السوق المالية"] },
    { q: "هدف التسوية البنكية (bank reconciliation):", a: "مطابقة رصيد الدفاتر مع كشف البنك وتفسير الفروق", w: ["حساب الضريبة", "إعداد قائمة الدخل", "تحويل الأموال بين البنوك"] },
    { q: "القيد المزدوج يعني أن كل عملية:", a: "تُسجّل في حسابين على الأقل، مدين ودائن بالمبلغ نفسه", w: ["تُسجّل مرتين في الحساب نفسه", "تُسجّل في دفترين منفصلين", "يراجعها محاسبان"] },
    { q: "المخزون في الميزانية العمومية يُصنّف:", a: "أصلاً متداولاً", w: ["أصلاً ثابتاً", "خصماً متداولاً", "حقوق ملكية"] },
  ] },
};

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const TESTS = BANK;

// this student's ROUND question indexes for a skill on a day: a shuffle seeded by
// SHA-256(user, skill, day), so it is the same on every load that day
export async function pick(uid, slug, day, size) {
  const seed = await sha(`${uid}|${slug}|${day}`);
  const order = [...Array(size).keys()];
  for (let i = size - 1, k = 0; i > 0; i--, k = (k + 4) % 60) {
    const j = parseInt(seed.slice(k, k + 4), 16) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, Math.min(ROUND, size));
}
const today = (now = new Date()) => now.toISOString().slice(0, 10);
// the day a set was served on: today, or yesterday for an attempt that crossed midnight
const servedDay = (d, now = new Date()) => (d === today(new Date(now.getTime() - DAY)) ? d : today(now));

export async function skilltests(request, env, path) {
  if (path === "/tests" && request.method === "GET") {
    return { tests: Object.entries(BANK).map(([slug, t]) => ({ slug, skill: t.skill, n: Math.min(ROUND, t.questions.length), bank: t.questions.length })), pass: PASS };
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
    // signed in: today's set for this student; a visitor just browsing gets any ROUND
    let ids;
    try { ids = await pick(await user(request, env), m[1], today(), test.questions.length); }
    catch { ids = shuffle([...test.questions.keys()]).slice(0, ROUND); }
    return { slug: m[1], skill: test.skill, pass: PASS, day: today(), questions: shuffle(ids.map((i) => {
      const x = test.questions[i];
      return { id: i, q: x.q, ...(x.code ? { code: x.code } : {}), options: shuffle([x.a, ...x.w]) };
    })) };
  }
  if (request.method === "POST") {
    const uid = await user(request, env);
    const input = await body(request, 8000);
    const now = new Date();
    const last = await env.DB.prepare("SELECT MAX(at) AS at FROM test_attempts WHERE user_id = ? AND skill = ?").bind(uid, m[1]).first();
    if (last && last.at && now - new Date(last.at) < DAY) throw refuse("wait", 429);
    const answers = input && typeof input.answers === "object" && input.answers ? input.answers : {};
    const ids = await pick(uid, m[1], servedDay(input?.day, now), test.questions.length);
    const wrong = ids.filter((i) => answers[i] !== test.questions[i].a);
    const score = ids.length - wrong.length;
    const passed = score / ids.length >= PASS;
    await env.DB.prepare("INSERT INTO test_attempts (user_id, skill, at) VALUES (?, ?, ?)").bind(uid, m[1], now.toISOString()).run();
    if (passed) {
      await env.DB.prepare(`INSERT INTO verified_skills (user_id, skill, score, passed_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, skill) DO UPDATE SET score = max(score, excluded.score), passed_at = excluded.passed_at`)
        .bind(uid, test.skill, Math.round((100 * score) / ids.length), now.toISOString()).run();
    }
    return { score, of: ids.length, passed, wrong };
  }
  return null;
}
