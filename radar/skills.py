"""Skill extraction and role classification from job title/description text."""
import re

# canonical skill -> regex that detects it (case-insensitive, word-bounded)
SKILL_PATTERNS: dict[str, str] = {
    "SQL":              r"\bsql\b",
    "Python":           r"\bpython\b",
    "R":                r"\bR\b(?=[ ,./)]|$)",
    "Excel":            r"\bexcel\b",
    "Power BI":         r"\bpower\s*bi\b",
    "Tableau":          r"\btableau\b",
    "Looker":           r"\blooker\b",
    "Qlik":             r"\bqlik\w*\b",
    "DAX":              r"\bdax\b",
    "Spark":            r"\b(?:py)?spark\b",
    "Hadoop":           r"\bhadoop\b",
    "Kafka":            r"\bkafka\b",
    "Airflow":          r"\bairflow\b",
    "dbt":              r"\bdbt\b",
    "Snowflake":        r"\bsnowflake\b",
    "Databricks":       r"\bdatabricks\b",
    "BigQuery":         r"\bbig\s*query\b",
    "Redshift":         r"\bredshift\b",
    "PostgreSQL":       r"\bpostgres(?:ql)?\b",
    "MySQL":            r"\bmysql\b",
    "SQL Server":       r"\bsql\s*server\b|\bmssql\b",
    "Oracle":           r"\boracle\b",
    "MongoDB":          r"\bmongo\s*db?\b",
    "AWS":              r"\baws\b|\bamazon web services\b",
    "Azure":            r"\bazure\b",
    "GCP":              r"\bgcp\b|\bgoogle cloud\b",
    "Docker":           r"\bdocker\b",
    "Kubernetes":       r"\bkubernetes\b|\bk8s\b",
    "Git":              r"\bgit(?:hub|lab)?\b",
    "Linux":            r"\blinux\b",
    "ETL":              r"\betl\b|\belt\b",
    "Machine Learning": r"\bmachine\s*learning\b|\bml\b",
    "Deep Learning":    r"\bdeep\s*learning\b",
    "NLP":              r"\bnlp\b|\bnatural language\b",
    "Statistics":       r"\bstatistic\w*\b",
    "A/B Testing":      r"\ba/?b\s*test\w*\b",
    "Pandas":           r"\bpandas\b",
    "NumPy":            r"\bnumpy\b",
    "Scikit-learn":     r"\bscikit|sklearn\b",
    "TensorFlow":       r"\btensor\s*flow\b",
    "PyTorch":          r"\bpytorch\b",
    "Java":             r"\bjava\b(?!script)",
    "Scala":            r"\bscala\b",
    "Terraform":        r"\bterraform\b",
    "SSIS/SSRS":        r"\bssis\b|\bssrs\b",
    "SAS":              r"\bsas\b",
}

_COMPILED = {skill: re.compile(pat, re.IGNORECASE) for skill, pat in SKILL_PATTERNS.items()}

# order matters: first match wins
ROLE_PATTERNS: list[tuple[str, str]] = [
    ("Analytics Engineer", r"analytics\s+engineer"),
    ("Data Engineer",      r"data\s+engineer|etl\s+developer|big\s*data\s+engineer"),
    ("ML Engineer",        r"(?:ml|machine\s*learning|ai)\s+engineer"),
    ("Data Scientist",     r"data\s+scien"),
    ("BI Developer",       r"\bbi\b|business\s+intelligence|power\s*bi\s+developer"),
    ("Data Analyst",       r"data\s+analy|analyst"),
]
_ROLES = [(role, re.compile(pat, re.IGNORECASE)) for role, pat in ROLE_PATTERNS]

# a posting must look data-related to enter the radar at all
DATA_FILTER = re.compile(
    r"data|analy|\bbi\b|business\s+intelligence|machine\s*learning|\betl\b", re.IGNORECASE
)

# clerical roles that mention "data" but are not data jobs
DATA_EXCLUDE = re.compile(r"data\s+entry|clerk|typist|transcription", re.IGNORECASE)

_TAG_RE = re.compile(r"<[^>]+>")


def strip_html(text: str) -> str:
    return _TAG_RE.sub(" ", text or "")


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
