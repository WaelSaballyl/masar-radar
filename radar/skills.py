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
}

_COMPILED = {skill: re.compile(pat, re.IGNORECASE) for skill, pat in SKILL_PATTERNS.items()}

# order matters: first match wins
ROLE_PATTERNS: list[tuple[str, str]] = [
    ("Analytics Engineer", r"analytics\s+engineer"),
    ("Data Engineer",      r"data\s+engineer|etl\s+developer|big\s*data\s+engineer"
                           r"|data\s+(?:platform|infrastructure|pipeline)\s+engineer"),
    ("ML Engineer",        r"(?:\bml|machine\s*learning|\bai)\s+engineer|\bmlops\b"
                           r"|(?:\bml|machine\s*learning)\s+scientist"),
    ("Data Scientist",     r"data\s+scien"),
    ("BI Developer",       r"business\s+intelligence"
                           r"|\bbi\s+(?:developer|analyst|engineer|consultant|specialist)"
                           r"|power\s*bi\s+(?:developer|analyst|consultant)"),
    ("Data Analyst",       r"data\s+analy"
                           r"|(?:reporting|insights?|quantitative|analytics)\s+analyst"),
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


def classify_role(title: str) -> str:
    for role, rx in _ROLES:
        if rx.search(title or ""):
            return role
    return "Other (Data)"


def extract_skills(text: str) -> list[str]:
    return [skill for skill, rx in _COMPILED.items() if rx.search(text or "")]
