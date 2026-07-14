"""Generate a static, self-contained Arabic dashboard from the radar database.

Run:  python -m radar.build_dashboard   ->  docs/dashboard.html
"""
import html
import json
from datetime import datetime, timezone
from pathlib import Path

from . import db

OUT = Path(__file__).resolve().parent.parent / "docs" / "dashboard.html"

ROLE_COLORS = {
    "Data Analyst": "#4f8ef7",
    "Data Engineer": "#34c98e",
    "Data Scientist": "#a78bfa",
    "BI Developer": "#f0b429",
    "ML Engineer": "#ef6461",
    "Analytics Engineer": "#2dd4bf",
    "Other (Data)": "#7c8aa5",
}


def esc(s) -> str:
    return html.escape(str(s or ""))


def bar_rows(pairs: list[tuple[str, int]], color: str | None = None) -> str:
    if not pairs:
        return '<div class="empty">لا توجد بيانات بعد — الرادار جديد وكل يوم يجمع أكثر</div>'
    mx = max(n for _, n in pairs)
    rows = []
    for label, n in pairs:
        c = color or ROLE_COLORS.get(label, "#4f8ef7")
        rows.append(
            f'<div class="bar-row"><div class="bar-label">{esc(label)}</div>'
            f'<div class="bar-track"><div class="bar-fill" style="width:{n / mx * 100:.0f}%;background:{c}"></div></div>'
            f'<div class="bar-count">{n}</div></div>'
        )
    return "".join(rows)


def build() -> None:
    con = db.connect()
    total = con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    companies = con.execute("SELECT COUNT(DISTINCT company) FROM jobs").fetchone()[0]
    sources = con.execute("SELECT COUNT(DISTINCT source) FROM jobs").fetchone()[0]
    with_salary = con.execute("SELECT COUNT(*) FROM jobs WHERE salary != ''").fetchone()[0]

    top_skills = con.execute(
        "SELECT skill, COUNT(*) n FROM job_skills GROUP BY skill ORDER BY n DESC, skill LIMIT 15"
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

    job_rows = "".join(
        f"""<tr>
          <td><div class="jt">{esc(t)}</div><div class="jc">{esc(c)}</div></td>
          <td>{esc(loc)}</td>
          <td><span class="chip" style="--c:{ROLE_COLORS.get(role, '#7c8aa5')}">{esc(role)}</span></td>
          <td>{esc(sal) or '—'}</td>
          <td>{esc(posted) or '—'}</td>
          <td>{f'<a href="{esc(url)}" target="_blank" rel="noopener">فتح ↗</a>' if url else ''}</td>
        </tr>"""
        for t, c, loc, role, sal, url, posted in recent
    )

    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    page = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>رادار مسار — سوق وظائف البيانات</title>
<style>
  :root {{ --bg:#0f1420; --surface:#1a2233; --border:#2e3a55; --text:#e8ecf4; --dim:#9aa7c0; --accent:#4f8ef7; }}
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ font-family:"Segoe UI",Tahoma,Arial,sans-serif; background:var(--bg); color:var(--text); padding:24px 16px 60px; }}
  .container {{ max-width:1100px; margin:0 auto; }}
  header {{ margin-bottom:24px; }}
  h1 {{ font-size:1.5rem; }}
  .sub {{ color:var(--dim); font-size:0.9rem; margin-top:4px; }}
  .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:24px; }}
  .card {{ background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; }}
  .card .label {{ color:var(--dim); font-size:0.8rem; margin-bottom:6px; }}
  .card .value {{ font-size:1.7rem; font-weight:700; }}
  .grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px; }}
  @media (max-width:720px) {{ .grid2 {{ grid-template-columns:1fr; }} }}
  .card h3 {{ font-size:0.95rem; margin-bottom:14px; color:var(--dim); font-weight:600; }}
  .bar-row {{ display:flex; align-items:center; gap:10px; margin-bottom:9px; }}
  .bar-label {{ width:130px; font-size:0.8rem; color:var(--dim); flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
  .bar-track {{ flex:1; background:#222c42; border-radius:6px; height:20px; overflow:hidden; }}
  .bar-fill {{ height:100%; border-radius:6px; min-width:2px; }}
  .bar-count {{ width:34px; text-align:left; font-size:0.85rem; font-weight:600; flex-shrink:0; }}
  .empty {{ color:var(--dim); font-size:0.85rem; text-align:center; padding:24px 0; }}
  .table-wrap {{ background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow-x:auto; }}
  table {{ width:100%; border-collapse:collapse; min-width:760px; }}
  th {{ text-align:right; padding:12px 14px; font-size:0.78rem; color:var(--dim); border-bottom:1px solid var(--border); white-space:nowrap; }}
  td {{ padding:12px 14px; border-bottom:1px solid var(--border); font-size:0.86rem; }}
  tr:last-child td {{ border-bottom:none; }}
  .jt {{ font-weight:600; }}
  .jc {{ color:var(--dim); font-size:0.78rem; margin-top:2px; }}
  .chip {{ background:color-mix(in srgb, var(--c) 18%, transparent); color:var(--c); padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:600; white-space:nowrap; }}
  a {{ color:var(--accent); text-decoration:none; }}
  a:hover {{ text-decoration:underline; }}
  footer {{ color:var(--dim); font-size:0.75rem; margin-top:30px; text-align:center; line-height:1.9; }}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>📡 رادار مسار — سوق وظائف البيانات</h1>
    <div class="sub">يُجمع آلياً يومياً · آخر تحديث: {updated}</div>
  </header>

  <section class="stats">
    <div class="card"><div class="label">إجمالي الوظائف المرصودة</div><div class="value">{total}</div></div>
    <div class="card"><div class="label">جديدة في آخر تشغيلة</div><div class="value" style="color:#34c98e">+{new_last}</div></div>
    <div class="card"><div class="label">شركات</div><div class="value">{companies}</div></div>
    <div class="card"><div class="label">مصادر</div><div class="value">{sources}</div></div>
    <div class="card"><div class="label">تعلن الراتب</div><div class="value">{with_salary}</div></div>
  </section>

  <section class="grid2">
    <div class="card"><h3>🏆 أكثر المهارات طلباً</h3>{bar_rows(top_skills, "#4f8ef7")}</div>
    <div class="card"><h3>👔 توزيع الأدوار</h3>{bar_rows(roles)}</div>
    <div class="card"><h3>📊 مهارات محلل البيانات / BI</h3>{bar_rows(analyst_skills, "#f0b429")}</div>
    <div class="card"><h3>⚙️ مهارات مهندس البيانات</h3>{bar_rows(engineer_skills, "#34c98e")}</div>
  </section>

  <div class="table-wrap">
    <table>
      <thead><tr><th>الوظيفة / الشركة</th><th>الموقع</th><th>الدور</th><th>الراتب</th><th>نُشرت</th><th></th></tr></thead>
      <tbody>{job_rows}</tbody>
    </table>
  </div>

  <footer>
    رادار مسار v0.1 — خط أنابيب بيانات مفتوح المصدر (Python + SQLite + GitHub Actions)<br>
    المصادر: <a href="https://remotive.com" target="_blank">Remotive</a> · <a href="https://remoteok.com" target="_blank">Remote OK</a> — شكراً لواجهاتهم المفتوحة
  </footer>
</div>
</body>
</html>"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"[done] dashboard -> {OUT}")


if __name__ == "__main__":
    build()
