"""Skill extraction and role classification from job title/description text."""
import html as _html
import re

# canonical skill -> regex that detects it.
#
# Patterns are matched case-insensitively. Short uppercase names (R, ML, SAS, ELT)
# opt out with (?-i:...) because a case-insensitive match fires on ordinary prose:
# r"\bR\b" with IGNORECASE matches the standalone "r" in "who r really good".
SKILL_PATTERNS: dict[str, str] = {
    # --- querying, spreadsheets, BI ---
    "SQL":              r"\bsql\b",
    "Excel":            r"\bexcel\b|\bاكسل\b|\bإكسل\b",
    "Power BI":         r"\bpower\s*bi\b|\bباور\s*بي\s*آي\b",
    "Power Query":      r"\bpower\s*query\b",
    "Tableau":          r"\btableau\b",
    "Looker":           r"\blooker\b",
    "Google Sheets":    r"\bgoogle\s*sheets\b",
    "Qlik":             r"\bqlik\w*\b",
    "DAX":              r"\bdax\b",
    "SSIS/SSRS":        r"\bssis\b|\bssrs\b",
    "Metabase":         r"\bmetabase\b",
    "Superset":         r"\bsuperset\b",
    "Sisense":          r"\bsisense\b",
    "Domo":             r"\bdomo\b",
    "Grafana":          r"\bgrafana\b",
    "VBA":              r"\bvba\b",

    # --- languages ---
    "Python":           r"\bpython\b|\bبايثون\b|\bبيثون\b",
    "R":                r"(?-i:\bR\b)(?=[\s,./)\]]|$)",
    "Java":             r"\bjava\b(?!script)",
    "Scala":            r"\bscala\b",
    "JavaScript":       r"\bjavascript\b|\btypescript\b",
    "Bash/Shell":       r"\bbash\b|\bshell\s*script\w*\b",

    # --- warehouses & databases ---
    "Snowflake":        r"\bsnowflake\b",
    "Databricks":       r"\bdatabricks\b",
    "BigQuery":         r"\bbig\s*query\b",
    "Redshift":         r"\bredshift\b",
    "Synapse":          r"\bsynapse\b",
    "Microsoft Fabric": r"\bmicrosoft\s*fabric\b",
    "PostgreSQL":       r"\bpostgres(?:ql)?\b",
    "MySQL":            r"\bmysql\b",
    "SQL Server":       r"\bsql\s*server\b|\bmssql\b",
    "Oracle":           r"\boracle\b",
    "MongoDB":          r"\bmongo\s*db?\b",
    "Elasticsearch":    r"\belastic\s*search\b|\belk\s+stack\b",
    "ClickHouse":       r"\bclickhouse\b",
    "DuckDB":           r"\bduckdb\b",
    "DynamoDB":         r"\bdynamo\s*db\b",
    "Cassandra":        r"\bcassandra\b",

    # --- pipelines & big data ---
    "Spark":            r"\b(?:py)?spark\b",
    "Hadoop":           r"\bhadoop\b",
    "Hive":             r"\bhive\b",
    "Kafka":            r"\bkafka\b",
    "Flink":            r"\bflink\b",
    "Airflow":          r"\bairflow\b",
    "dbt":              r"\bdbt\b",
    "Dagster":          r"\bdagster\b",
    "Prefect":          r"\bprefect\b",
    "Informatica":      r"\binformatica\b",
    "Talend":           r"\btalend\b",
    "Alteryx":          r"\balteryx\b",
    "Trino/Presto":     r"\btrino\b|\bpresto\b",
    "ETL":              r"\betl\b|(?-i:\bELT\b)",
    "Data Modeling":    r"\bdata\s*model\w*\b|\bdimensional\s+model\w*\b|\bstar\s+schema\b",
    "Data Warehousing": r"\bdata\s*warehous\w*\b|\bdata\s*lake\w*\b|\blakehouse\b",
    "Data Governance":  r"\bdata\s*governance\b|\bdata\s*quality\b|\bdata\s*steward\w*\b",

    # --- cloud & platform ---
    "AWS":              r"\baws\b|\bamazon\s+web\s+services\b",
    "Azure":            r"\bazure\b",
    "GCP":              r"\bgcp\b|\bgoogle\s+cloud\b",
    "Docker":           r"\bdocker\b",
    "Kubernetes":       r"\bkubernetes\b|\bk8s\b",
    "Terraform":        r"\bterraform\b",
    "Git":              r"\bgit(?:hub|lab)?\b",
    "Linux":            r"\blinux\b",
    "CI/CD":            r"\bci\s*/\s*cd\b|\bcontinuous\s+(?:integration|deployment)\b",
    "REST API":         r"\brest\w*\s+api\b|\bapi\s+integration\b",

    # --- analysis, stats, ML ---
    "Statistics":       r"\bstatistic\w*\b",
    "A/B Testing":      r"\ba/?b\s*test\w*\b|\bexperimentation\b",
    "Time Series":      r"\btime\s*series\b|\bforecast\w*\b",
    "Machine Learning": r"\bmachine\s*learning\b|(?-i:\bML\b)",
    "Deep Learning":    r"\bdeep\s*learning\b",
    "NLP":              r"\bnlp\b|\bnatural\s+language\b",
    "Computer Vision":  r"\bcomputer\s+vision\b",
    "GenAI/LLM":        r"\bllms?\b|\bgen(?:erative)?\s*ai\b|\bprompt\s+engineer\w*\b",
    "Pandas":           r"\bpandas\b",
    "NumPy":            r"\bnumpy\b",
    "Scikit-learn":     r"\bscikit\b|\bsklearn\b",
    "TensorFlow":       r"\btensor\s*flow\b",
    "PyTorch":          r"\bpytorch\b",
    "XGBoost":          r"\bxgboost\b|\blightgbm\b",
    "Hugging Face":     r"\bhugging\s*face\b",
    "Jupyter":          r"\bjupyter\b",
    "Matplotlib":       r"\bmatplotlib\b|\bseaborn\b",
    "Plotly":           r"\bplotly\b",
    "Streamlit":        r"\bstreamlit\b",
    "SAS":              r"(?-i:\bSAS\b)",
    "SPSS":             r"\bspss\b",

    # --- business systems ---
    "Salesforce":       r"\bsalesforce\b",
    "SAP":              r"(?-i:\bSAP\b)",
    "Google Analytics": r"\bgoogle\s*analytics\b|\bga4\b",

    # --- software and IT (field "tech") ---
    "TypeScript":       r"\btypescript\b",
    "React":            r"\breact(?:\.js|js)?\b(?!\s+(?:to|quickly|fast))",
    "Angular":          r"\bangular(?:js)?\b",
    "Vue":              r"\bvue(?:\.js|js)?\b",
    "Node.js":          r"\bnode(?:\.js|js)\b",
    "C#/.NET":          r"(?-i:\bC#)|\.net\b|\basp\.net\b",
    "C++":              r"(?-i:\bC\+\+)",
    "Go":               r"\bgolang\b|(?-i:\bGo\b)(?=\s*(?:,|/|and\b|or\b|\)|developer|engineer|programming))",
    "PHP":              r"\bphp\b|\blaravel\b",
    "Swift/iOS":        r"\bswift(?:ui)?\b|\bios\s+development\b",
    "Kotlin/Android":   r"\bkotlin\b|\bandroid\s+(?:development|sdk|studio)\b",
    "Flutter":          r"\bflutter\b",
    "HTML/CSS":         r"(?-i:\bHTML5?\b)|(?-i:\bCSS3?\b)",
    "Networking":       r"\bccna\b|\bccnp\b|\btcp/ip\b|\brouting\s+and\s+switching\b|\bnetwork\s+administration\b",
    "Cybersecurity":    r"\bcyber\s*security\b|\bsiem\b|\bpenetration\s+testing\b|\bsecurity\+|\bcissp\b|\biso\s*27001\b|أمن\s*سيبراني",
    "Testing/QA":       r"\bselenium\b|\bcypress\b|\bunit\s+test(?:s|ing)\b|\btest\s+automation\b|\bistqb\b",
    "Agile/Scrum":      r"\bagile\s+(?:methodolog\w*|development|environment|practices|teams?|delivery|framework|ceremonies)\b|\bscrum\b|\bjira\b",

    # --- accounting and finance (field "finance") ---
    "IFRS":             r"\bifrs\b|\bgaap\b",
    "Financial Reporting": r"\bfinancial\s+(?:statements?|reporting)\b|\bmonth[-\s]end\s+close\b|القوائم\s+المالية",
    "Financial Modeling": r"\bfinancial\s+model(?:l)?ing\b|\bvaluation\b|\bdcf\b",
    "Budgeting":        r"\bbudgeting\b|\bbudgets?\s+(?:and|&)\s+forecast\w*|الموازنة",
    "Audit":            r"\b(?:internal|external|financial|statutory)\s+audit\w*|\bauditing\b|\bauditors?\b|تدقيق|مراجعة\s+الحسابات",
    "Tax/VAT/Zakat":    r"\bvat\b|\bzakat\b|زكاة|ضريبة|\btax\s+(?:compliance|returns?|filings?)\b",
    "Accounts Payable/Receivable": r"\baccounts?\s+(?:payable|receivable)\b",
    "Reconciliation":   r"\b(?:bank|account|balance\s+sheet|intercompany)\s+reconciliations?\b|تسويات\s+بنكية",
    # CPA alone is also marketing's cost per acquisition ("CAC, CPA, ROI"):
    # only the accounting qualification, named as one, counts
    "SOCPA/CPA/CMA":    r"\bsocpa\b|\bcertified\s+(?:public|management)\s+accountant|(?-i:\b(?:CPA|CMA|CFA)\b)\s*(?:licen[cs]e|certifi\w*|qualif\w*|designation|charter\w*|holder|candidate|level)|\bacca\b",
    "Oracle Financials": r"\boracle\s+(?:financials|fusion|erp|ebs)\b",
    "QuickBooks":       r"\bquickbooks\b|\bxero\b|\bzoho\s+books\b",

    # --- engineering (field "engineering") ---
    "AutoCAD":          r"\bautocad\b|\bcivil\s*3d\b",
    "Revit/BIM":        r"\brevit\b|(?-i:\bBIM\b)",
    "SolidWorks":       r"\bsolidworks\b|\bcatia\b|\bcreo\b",
    "MATLAB":           r"\bmatlab\b|\bsimulink\b",
    "Primavera/MS Project": r"\bprimavera\b|(?-i:\bP6\b)|\bms\s+project\b|\bmicrosoft\s+project\b",
    "PMP":              r"(?-i:\bPMP\b)|\bproject\s+management\s+professional\b",
    "HSE":              r"(?-i:\bHSE\b)|\bnebosh\b|\bosha\b|السلامة\s+المهنية",
    "PLC/SCADA":        r"\bplc\s+(?:programming|systems?|logic)\b|(?-i:\bPLC\b)\s*/\s*scada|\bscada\b|(?-i:\bDCS\b)",
    "ETAP":             r"(?-i:\bETAP\b)",
    "ANSYS":            r"\bansys\b|\bfinite\s+element\b",
    "Lean/Six Sigma":   r"\blean\s+manufacturing\b|\bsix\s+sigma\b|\bkaizen\b",

    # --- marketing (field "marketing") ---
    "SEO/SEM":          r"(?-i:\bSEO\b)|(?-i:\bSEM\b)|\bsearch\s+engine\s+optimi[sz]ation\b",
    "Google Ads":       r"\bgoogle\s+ads\b|\badwords\b",
    "Meta Ads":         r"\b(?:meta|facebook|instagram|snapchat|tiktok)\s+ads\b",
    "Social Media":     r"\bsocial\s+media\s+(?:management|marketing|strategy|content|campaigns?|platforms)\b|سوشيال\s*ميديا|وسائل\s+التواصل",
    "Content Writing":  r"\bcopywriting\b|\bcontent\s+(?:writing|creation)\b|كتابة\s+المحتوى",
    "HubSpot":          r"\bhubspot\b|\bmarketo\b|\bmailchimp\b",
    "Adobe Creative Suite": r"\bphotoshop\b|\billustrator\b|\bindesign\b|\bpremiere\s+pro\b|\bafter\s+effects\b",
    "Canva":            r"\bcanva\b",
    "Email Marketing":  r"\bemail\s+(?:marketing|campaigns?)\b",
    "Market Research":  r"\bmarket\s+research\b|\bcompetitor\s+analysis\b",

    # --- human resources (field "hr") ---
    "Recruitment":      r"\bfull[-\s]cycle\s+recruit\w*|\bsourcing\s+candidates\b|\binterview\s+scheduling\b|\bscreening\s+(?:cvs|resumes|candidates)\b|استقطاب",
    "Payroll":          r"\bpayroll\b|الرواتب",
    "HRIS":             r"\bhris\b|\bsuccessfactors\b|\bworkday\b|\bbamboohr\b",
    "Saudi Labor Law":  r"\bsaudi\s+labou?r\s+law\b|نظام\s+العمل|\bgosi\b|\bqiwa\b|\bmudad\b|التأمينات\s+الاجتماعية",
    "Onboarding":       r"\bemployee\s+onboarding\b|\bonboarding\s+(?:of\s+)?new\s+(?:hires|employees|joiners)\b",
    "Employee Relations": r"\bemployee\s+relations\b",
    "Training & Development": r"\btraining\s+needs\s+analysis\b|\b(?:design|deliver)(?:ing)?\s+training\s+programs?\b|\bl&d\s+(?:programs?|initiatives)\b",
}

_COMPILED = {skill: re.compile(pat, re.IGNORECASE) for skill, pat in SKILL_PATTERNS.items()}

# order matters: first match wins
ROLE_PATTERNS: list[tuple[str, str]] = [
    ("Analytics Engineer", r"analytics\s+engineer"),
    ("Data Engineer",      r"data\s+engineer|etl\s+developer|big\s*data\s+engineer"
                           r"|data\s+(?:platform|infrastructure|pipeline)\s+engineer"
                           r"|data\s+architect|analytics\s+platform"
                           r"|data\s+(?:lake|warehous)"),
    ("ML Engineer",        r"(?:\bml|machine\s*learning|\bai)\s+engineer|\bmlops\b"
                           r"|(?:\bml|machine\s*learning)\s+scientist"),
    ("Data Scientist",     r"data\s+scien|statistician|biostatistic"),
    ("BI Developer",       r"business\s+intelligence"
                           r"|\bbi\s+(?:developer|analyst|engineer|consultant|specialist)"
                           r"|power\s*bi\s+(?:developer|analyst|consultant)"),
    # Last analytics-flavoured rule, so it only sees titles the engineer and
    # scientist rules above passed over: leads, managers and consultants whose
    # work is analysis rather than building the platform.
    ("Data Analyst",       r"data\s+analy"
                           r"|(?:reporting|insights?|quantitative|analytics)\s+analyst"
                           r"|analytics"),
    ("Business Analyst",   r"business\s+analyst|(?:marketing|product|research)\s+analyst"),
]
_ROLES = [(role, re.compile(pat, re.IGNORECASE)) for role, pat in ROLE_PATTERNS]

# A posting must show a real data signal in its TITLE to enter the radar.
#
# The old filter accepted a bare "analy", which let every analyst in: KYC,
# compliance, crypto trading and drilling-ops postings all landed in the radar
# as "Data Analyst". Analyst titles now need a qualifier from a short allowlist.
DATA_FILTER = re.compile(
    r"""
      data\s+(?:analy|scien|engineer|architect|special|steward|governance
                |quality|ops|operation|platform|model|warehous|migration|manage)
    | analytics
    | business\s+intelligence
    | \bbi\s+(?:developer|analyst|engineer|consultant|specialist)
    | machine\s*learning | \bml\s+engineer | \bai\s+engineer | \bmlops\b
    | \betl\b | data\s*warehous | data\s*lake | \bbig\s*data\b
    | (?:business|reporting|insights?|quantitative|marketing|product|research)\s+analyst
    | statistician | biostatistic
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Titles that contain a data-ish word but are not data jobs. Checked against the
# title only, so broad terms here are safe.
DATA_EXCLUDE = re.compile(
    r"""
      data\s+entry | \bclerk\b | typist | transcription | data\s+collector
    | compliance | \bkyc\b | \baml\b | anti[-\s]?money | sanctions
    | governance,?\s*risk | \bgrc\b | brand\s+protection | fraud\s+analyst
    | \bcrypto\b | \btrader\b | \btrading\b | forex
    | drilling | well\s*site | mud\s*logg | geolog
    | \bhr\b | human\s+resource | recruit | payroll | talent\s+acquisition
    | \bqa\s+analyst | quality\s+assurance\s+analyst | test\s+analyst
    | security\s+analyst | \bsoc\s+analyst | threat\s+analyst | cyber
    | help\s*desk | service\s+desk | support\s+analyst | desktop\s+support
    | claims?\s+analyst | credit\s+analyst | underwrit | actuar
    | \bsales\s+analyst | procurement | supply\s+chain\s+analyst
    """,
    re.IGNORECASE | re.VERBOSE,
)

_TAG_RE = re.compile(r"<[^>]+>")


def strip_html(text: str) -> str:
    """Drop tags and resolve entities so "C&amp;A" and "&nbsp;" do not block matches."""
    return _html.unescape(_TAG_RE.sub(" ", text or ""))


def is_data_job(title: str) -> bool:
    t = title or ""
    return bool(DATA_FILTER.search(t)) and not DATA_EXCLUDE.search(t)


# The fields the radar collects, read from the TITLE like the data filter.
# Data comes first, so "Financial Data Analyst" stays data; a title the data
# filter refuses (a security or credit analyst, HR data) falls through to the
# field it really belongs to. Anything no rule names is not collected.
_FIELD_PATTERNS = [
    ("tech", r"""
        software | developer | programmer | \bdev\b | front[-\s]?end | back[-\s]?end | full[-\s]?stack
      | mobile\s+(?:app|engineer|developer) | \bios\b | android | web\s+(?:developer|engineer|designer)
      | devops | \bsre\b | site\s+reliability | cloud\s+(?:engineer|architect|administrator)
      | (?:solutions?|enterprise|software)\s+architect | platform\s+engineer
      | systems?\s+(?:engineer|administrator|analyst) | network\s+(?:engineer|administrator|specialist)
      | cyber | security\s+(?:engineer|analyst|specialist) | \bsoc\b | penetration
      | \bqa\b | quality\s+assurance | test(?:ing)?\s+(?:engineer|automation|analyst)
      | \bit\s+(?:support|specialist|intern|analyst|trainee|officer|technician)
      | help\s*desk | service\s+desk | technical\s+support | desktop\s+support
      | ui\s*/?\s*ux | ux\s+designer | product\s+(?:manager|owner|designer)
      | مطور | مبرمج | برمجيات | سيبراني | تقنية\s+المعلومات | دعم\s+فني | الدعم\s+الفني
    """),
    ("finance", r"""
        accountant | accounting | \baccounts?\s+(?:payable|receivable)
      | financ | auditor | \baudit\b | treasury | \btax\b | zakat | \bvat\b | bookkeep
      | controller | \bcfo\b | credit\s+analyst | investment | banking | actuar | underwrit
      | محاسب | مالي | تدقيق | مراجع\s+حسابات | زكاة | ضريب
    """),
    ("engineering", r"""
        (?:civil|mechanical|electrical|chemical|industrial|petroleum|process|structural|mechatronics?
          |biomedical|environmental|project|site|planning|maintenance|design|production|manufacturing
          |quality|hse|safety|instrument(?:ation)?|control|piping|mep|construction|geotechnical|energy
          |renewable|power|telecom(?:munications?)?|cost|estimation|reliability|field|commissioning)\s+engineer
      | engineering\s+(?:intern|trainee|co-?op|graduate|internship)
      | مهندس | هندسة | هندسي
    """),
    ("marketing", r"""
        marketing | social\s+media | content\s+(?:creator|writer|specialist|manager|strategist)
      | copywrit | \bseo\b | \bsem\b | brand(?:ing)?\s+(?:manager|specialist|executive|intern)
      | communications?\s+(?:specialist|officer|manager|intern|coordinator) | public\s+relations
      | \bpr\s+(?:specialist|officer|intern) | growth\s+(?:marketer|manager) | community\s+manager
      | media\s+buyer | graphic\s+designer
      | تسويق | سوشيال\s*ميديا | علاقات\s+عامة | صانع\s+محتوى | كاتب\s+محتوى | مصمم\s+جرافيك
    """),
    ("hr", r"""
        \bhr\b | human\s+resource | recruit | talent\s+acquisition | people\s+(?:operations|partner|ops)
      | payroll | compensation | benefits\s+(?:specialist|analyst|coordinator)
      | learning\s+(?:and|&)\s+development | \bl&d\b | training\s+(?:specialist|coordinator)
      | موارد\s+بشرية | الموارد\s+البشرية | توظيف | استقطاب | رواتب | شؤون\s+الموظفين
    """),
]
FIELD_RULES = [(name, re.compile(pat, re.IGNORECASE | re.VERBOSE)) for name, pat in _FIELD_PATTERNS]
FIELDS = ["data", *(name for name, _ in FIELD_RULES)]


def field_of(title: str) -> str | None:
    """The field a posting's title puts it in, or None when the radar skips it."""
    if is_data_job(title):
        return "data"
    for name, rx in FIELD_RULES:
        if rx.search(title or ""):
            return name
    return None


# Roles outside data: the field decides, one role each, so the postings page
# can filter them without a second taxonomy to maintain.
FIELD_ROLE = {"tech": "Software & IT", "finance": "Accounting & Finance", "engineering": "Engineering",
              "marketing": "Marketing", "hr": "Human Resources"}


def classify_role(title: str) -> str:
    field = field_of(title)
    if field and field != "data":
        return FIELD_ROLE[field]
    for role, rx in _ROLES:
        if rx.search(title or ""):
            return role
    return "Other (Data)"


def extract_skills(text: str) -> list[str]:
    return [skill for skill, rx in _COMPILED.items() if rx.search(text or "")]
