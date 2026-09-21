"""Generate a static, self-contained Arabic dashboard from the radar database.

Run:  python -m radar.build_dashboard   ->  docs/dashboard.html

Colors follow the validated reference palette (light + dark selected separately,
CVD-checked). Role colors are fixed per entity, never cycled.
"""
import html
import json
from datetime import datetime, timezone
from pathlib import Path

from . import db

OUT = Path(__file__).resolve().parent.parent / "docs" / "dashboard.html"

# fixed categorical assignment: color follows the role entity
ROLE_VARS = {
    "Data Analyst": "--c-analyst",
    "Data Engineer": "--c-engineer",
    "BI Developer": "--c-bi",
    "Data Scientist": "--c-scientist",
    "Business Analyst": "--c-business",
    "ML Engineer": "--c-ml",
    "Analytics Engineer": "--c-analytics",
    "Other (Data)": "--c-other",
}

ROLE_LABELS_AR = {
    "Data Analyst": "محلل بيانات",
    "Data Engineer": "مهندس بيانات",
    "BI Developer": "مطوّر BI",
    "Data Scientist": "عالم بيانات",
    "Business Analyst": "محلل أعمال",
    "ML Engineer": "مهندس تعلم آلي",
    "Analytics Engineer": "مهندس تحليلات",
    "Other (Data)": "أخرى (بيانات)",
}


def esc(s) -> str:
    return html.escape(str(s or ""))


def bar_rows(pairs: list[tuple[str, int]], total: int, color_var: str | None = None,
             labels_map: dict | None = None) -> str:
    if not pairs:
        return '<p class="empty">لا توجد بيانات كافية بعد — الرادار يجمع يومياً وتكتمل الصورة مع الوقت.</p>'
    mx = max(n for _, n in pairs)
    rows = []
    for label, n in pairs:
        var = color_var or ROLE_VARS.get(label, "--c-other")
        shown = (labels_map or {}).get(label, label)
        pct = f"{n / total * 100:.0f}٪" if total else ""
        rows.append(
            f'<div class="bar-row" title="{esc(shown)} — {n} وظيفة ({pct})">'
            f'<span class="bar-label">{esc(shown)}</span>'
            f'<span class="bar-track"><span class="bar-fill" style="width:{n / mx * 100:.1f}%;background:var({var})"></span></span>'
            f'<span class="bar-count">{n}</span></div>'
        )
    return "".join(rows)


def build() -> None:
    con = db.connect()
    total = con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    companies = con.execute("SELECT COUNT(DISTINCT company) FROM jobs").fetchone()[0]
    n_sources = con.execute("SELECT COUNT(DISTINCT source) FROM jobs").fetchone()[0]
    first_day = con.execute("SELECT MIN(substr(collected_at,1,10)) FROM jobs").fetchone()[0] or "—"

    top_skills = con.execute(
        "SELECT skill, COUNT(*) n FROM job_skills GROUP BY skill ORDER BY n DESC, skill LIMIT 12"
    ).fetchall()
    roles = con.execute(
        "SELECT role, COUNT(*) n FROM jobs GROUP BY role ORDER BY n DESC"
    ).fetchall()
    analyst_skills = con.execute(
        """SELECT skill, COUNT(*) n FROM job_skills js JOIN jobs j ON j.id = js.job_id
           WHERE j.role IN ('Data Analyst', 'BI Developer')
           GROUP BY skill ORDER BY n DESC LIMIT 8"""
    ).fetchall()
    engineer_skills = con.execute(
        """SELECT skill, COUNT(*) n FROM job_skills js JOIN jobs j ON j.id = js.job_id
           WHERE j.role IN ('Data Engineer', 'Analytics Engineer')
           GROUP BY skill ORDER BY n DESC LIMIT 8"""
    ).fetchall()
    recent = con.execute(
        """SELECT title, company, location, role, salary, url, posted_at
           FROM jobs ORDER BY collected_at DESC, posted_at DESC LIMIT 25"""
    ).fetchall()
    con.close()

    last_run_path = Path(db.DB_PATH).parent / "last_run.json"
    new_last = 0
    if last_run_path.exists():
        new_last = json.loads(last_run_path.read_text(encoding="utf-8")).get("new", 0)

    n_skilled = sum(n for _, n in top_skills)

    job_rows = "".join(
        f"""<tr>
          <td><span class="jt">{esc(t)}</span><span class="jc">{esc(c)}</span></td>
          <td class="dim">{esc(loc)}</td>
          <td><span class="chip" style="--c:var({ROLE_VARS.get(role, '--c-other')})">{esc(ROLE_LABELS_AR.get(role, role))}</span></td>
          <td class="num">{esc(sal) or '—'}</td>
          <td class="num dim">{esc(posted) or '—'}</td>
          <td>{f'<a href="{esc(url)}" target="_blank" rel="noopener">عرض</a>' if url else ''}</td>
        </tr>"""
        for t, c, loc, role, sal, url, posted in recent
    )

    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    page = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>الرادار — مؤشر سوق وظائف البيانات | مسار</title>
<style>
  :root {{
    --page:      #f9f9f7;
    --surface:   #fcfcfb;
    --ink:       #0b0b0b;
    --ink-2:     #52514e;
    --muted:     #898781;
    --hairline:  rgba(11,11,11,0.10);
    --grid:      #e1e0d9;
    --track:     #f0efec;
    --good:      #006300;
    --c-analyst:   #2a78d6;
    --c-engineer:  #1baf7a;
    --c-bi:        #eda100;
    --c-scientist: #4a3aa7;
    --c-ml:        #e34948;
    --c-analytics: #eb6834;
    --c-business:  #4f6272;
    --c-other:     #898781;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --page:      #0d0d0d;
      --surface:   #1a1a19;
      --ink:       #ffffff;
      --ink-2:     #c3c2b7;
      --muted:     #898781;
      --hairline:  rgba(255,255,255,0.10);
      --grid:      #2c2c2a;
      --track:     #262624;
      --good:      #0ca30c;
      --c-analyst:   #3987e5;
      --c-engineer:  #199e70;
      --c-bi:        #c98500;
      --c-scientist: #9085e9;
      --c-ml:        #e66767;
      --c-analytics: #d95926;
      --c-business:  #8ba0b2;
    }}
  }}
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--page); color: var(--ink);
    padding: 0 20px 64px; line-height: 1.5;
  }}
  .container {{ max-width: 1080px; margin: 0 auto; }}

  .topbar {{
    display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:8px;
    padding: 28px 0 8px;
  }}
  .brand {{ display:flex; align-items:baseline; gap:10px; }}
  .brand .mark {{ font-size:1.35rem; font-weight:700; letter-spacing:-0.01em; }}
  .brand .sep {{ color:var(--muted); }}
  .brand .prod {{ font-size:1.05rem; color:var(--ink-2); font-weight:600; }}
  .updated {{ font-size:0.8rem; color:var(--muted); font-variant-numeric: tabular-nums; }}

  .lede {{ color:var(--ink-2); font-size:0.92rem; max-width:60ch; margin-bottom:28px; }}

  .tiles {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:28px; }}
  .tile {{
    background:var(--surface); border:1px solid var(--hairline); border-radius:10px;
    padding:16px 18px;
  }}
  .tile .label {{ font-size:0.78rem; color:var(--muted); margin-bottom:4px; }}
  .tile .value {{ font-size:1.85rem; font-weight:650; letter-spacing:-0.02em; }}
  .tile .delta {{ font-size:0.78rem; color:var(--good); font-weight:600; margin-top:2px; }}
  .tile .note  {{ font-size:0.78rem; color:var(--muted); margin-top:2px; }}

  .grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:28px; }}
  @media (max-width:720px) {{ .grid2 {{ grid-template-columns:1fr; }} }}
  .panel {{
    background:var(--surface); border:1px solid var(--hairline); border-radius:10px;
    padding:18px 20px;
  }}
  .panel h2 {{ font-size:0.88rem; font-weight:650; margin-bottom:4px; }}
  .panel .hint {{ font-size:0.76rem; color:var(--muted); margin-bottom:16px; }}

  .bar-row {{ display:flex; align-items:center; gap:12px; padding:4px 0; }}
  .bar-row:hover .bar-fill {{ filter:brightness(0.9); }}
  .bar-label {{
    width:128px; flex-shrink:0; font-size:0.8rem; color:var(--ink-2);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }}
  .bar-track {{ flex:1; display:block; background:var(--track); border-radius:4px; height:12px; overflow:hidden; }}
  .bar-fill {{ display:block; height:100%; border-radius:0 4px 4px 0; min-width:2px; }}
  [dir="rtl"] .bar-fill {{ border-radius:4px 0 0 4px; }}
  .bar-count {{
    width:32px; flex-shrink:0; text-align:left; font-size:0.8rem; font-weight:600;
    font-variant-numeric: tabular-nums;
  }}
  .empty {{ color:var(--muted); font-size:0.84rem; padding:20px 0; }}

  .section-title {{ font-size:0.88rem; font-weight:650; margin-bottom:12px; }}
  .table-wrap {{
    background:var(--surface); border:1px solid var(--hairline); border-radius:10px;
    overflow-x:auto;
  }}
  table {{ width:100%; border-collapse:collapse; min-width:740px; }}
  th {{
    text-align:right; padding:11px 16px; font-size:0.74rem; font-weight:600;
    color:var(--muted); border-bottom:1px solid var(--grid); white-space:nowrap;
  }}
  td {{ padding:11px 16px; border-bottom:1px solid var(--grid); font-size:0.85rem; vertical-align:top; }}
  tr:last-child td {{ border-bottom:none; }}
  .jt {{ display:block; font-weight:600; }}
  .jc {{ display:block; color:var(--muted); font-size:0.78rem; margin-top:1px; }}
  .dim {{ color:var(--ink-2); }}
  .num {{ font-variant-numeric: tabular-nums; white-space:nowrap; }}
  .chip {{
    display:inline-block; font-size:0.74rem; font-weight:600; color:var(--c);
    padding:2px 0; white-space:nowrap;
  }}
  .chip::before {{
    content:""; display:inline-block; width:8px; height:8px; border-radius:50%;
    background:var(--c); margin-inline-end:6px;
  }}
  a {{ color:var(--c-analyst); text-decoration:none; font-size:0.8rem; font-weight:600; }}
  a:hover {{ text-decoration:underline; }}

  footer {{
    color:var(--muted); font-size:0.76rem; margin-top:32px;
    padding-top:16px; border-top:1px solid var(--grid); line-height:1.9;
  }}
  footer a {{ color:var(--ink-2); font-size:inherit; font-weight:500; }}
</style>
</head>
<body>
<div class="container">
  <div class="topbar">
    <div class="brand">
      <span class="mark">مسار</span><span class="sep">/</span><span class="prod">الرادار</span>
    </div>
    <span class="updated">آخر تحديث: {updated}</span>
  </div>
  <p class="lede">مؤشر يومي لسوق وظائف البيانات: يجمع الإعلانات آلياً من مصادر مفتوحة، ويستخرج المهارات المطلوبة واتجاهات الأدوار.</p>

  <section class="tiles">
    <div class="tile"><div class="label">الوظائف المرصودة</div><div class="value">{total}</div><div class="delta">+{new_last} في آخر تحديث</div></div>
    <div class="tile"><div class="label">شركات</div><div class="value">{companies}</div></div>
    <div class="tile"><div class="label">مصادر البيانات</div><div class="value">{n_sources}</div></div>
    <div class="tile"><div class="label">يُجمع منذ</div><div class="value" style="font-size:1.2rem;padding-top:8px">{first_day}</div><div class="note">تشغيلة يومية مجدولة</div></div>
  </section>

  <section class="grid2">
    <div class="panel">
      <h2>أكثر المهارات طلباً</h2>
      <p class="hint">عدد الإعلانات التي وردت فيها كل مهارة</p>
      {bar_rows(top_skills, n_skilled, "--c-analyst")}
    </div>
    <div class="panel">
      <h2>توزيع الأدوار</h2>
      <p class="hint">تصنيف آلي من المسمى الوظيفي</p>
      {bar_rows(roles, total, None, ROLE_LABELS_AR)}
    </div>
    <div class="panel">
      <h2>مهارات محلل البيانات وBI</h2>
      <p class="hint">الأكثر وروداً في إعلانات التحليل</p>
      {bar_rows(analyst_skills, sum(n for _, n in analyst_skills), "--c-analyst")}
    </div>
    <div class="panel">
      <h2>مهارات مهندس البيانات</h2>
      <p class="hint">الأكثر وروداً في إعلانات الهندسة</p>
      {bar_rows(engineer_skills, sum(n for _, n in engineer_skills), "--c-engineer")}
    </div>
  </section>

  <h2 class="section-title">أحدث الوظائف المرصودة</h2>
  <div class="table-wrap">
    <table>
      <thead><tr><th>الوظيفة</th><th>الموقع</th><th>الدور</th><th>الراتب</th><th>نُشرت</th><th></th></tr></thead>
      <tbody>{job_rows}</tbody>
    </table>
  </div>

  <footer>
    الرادار — أحد مكوّنات منصة مسار · خط أنابيب بيانات مفتوح المصدر (Python · SQLite · GitHub Actions)<br>
    البيانات بواسطة الواجهات العامة لـ <a href="https://remotive.com" target="_blank" rel="noopener">Remotive</a> و<a href="https://remoteok.com" target="_blank" rel="noopener">Remote OK</a>.
  </footer>
</div>
</body>
</html>"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"[done] dashboard -> {OUT}")


if __name__ == "__main__":
    build()
