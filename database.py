"""
database.py — SQLite storage for jobs, candidates, and activity logs.

Schema:
  - jobs: stores job postings with their JD text
  - candidates: stores resumes + extracted data + match results (all tied to a job)
  - activity_log: simple event log for the dashboard's "Recent activity" feed

All JSON-serialized fields (skills, experience, etc.) are stored as TEXT columns
and parsed back to Python lists/dicts on read.
"""

import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screener.db")


def get_conn():
    """Get a database connection with row_factory for dict-like access."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create tables if they don't exist. Called once on server startup."""
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            name TEXT DEFAULT 'Unknown',
            email TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            resume_text TEXT NOT NULL,
            skills TEXT DEFAULT '[]',
            experience TEXT DEFAULT '[]',
            education TEXT DEFAULT '[]',
            projects TEXT DEFAULT '[]',
            match_score INTEGER DEFAULT 0,
            matched_skills TEXT DEFAULT '[]',
            missing_skills TEXT DEFAULT '[]',
            experience_relevance TEXT DEFAULT '',
            justification TEXT DEFAULT '',
            category TEXT DEFAULT 'pending',
            screened INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            message TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
        );
    """)
    conn.commit()
    conn.close()


# ── Job CRUD ──────────────────────────────────────

def create_job(title: str, description: str) -> int:
    """Insert a new job posting. Returns its ID."""
    conn = get_conn()
    cursor = conn.execute(
        "INSERT INTO jobs (title, description) VALUES (?, ?)",
        (title, description),
    )
    job_id = cursor.lastrowid
    conn.execute(
        "INSERT INTO activity_log (job_id, message) VALUES (?, ?)",
        (job_id, f"New job created: {title}"),
    )
    conn.commit()
    conn.close()
    return job_id


def get_all_jobs() -> list:
    """List every job with aggregate candidate statistics."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT j.*,
            COUNT(c.id)                                              AS total_candidates,
            SUM(CASE WHEN c.category = 'strong'  THEN 1 ELSE 0 END) AS strong_count,
            SUM(CASE WHEN c.category = 'review'  THEN 1 ELSE 0 END) AS review_count,
            SUM(CASE WHEN c.category = 'low'     THEN 1 ELSE 0 END) AS low_count,
            SUM(CASE WHEN c.category = 'pending' THEN 1 ELSE 0 END) AS pending_count
        FROM jobs j
        LEFT JOIN candidates c ON j.id = c.job_id
        GROUP BY j.id
        ORDER BY j.created_at DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_job(job_id: int) -> dict | None:
    """Fetch a single job by primary key."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_job(job_id: int):
    """Delete a job and cascade-delete its candidates."""
    conn = get_conn()
    row = conn.execute("SELECT title FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row:
        conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.execute(
            "INSERT INTO activity_log (message) VALUES (?)",
            (f"Job deleted: {row['title']}",),
        )
        conn.commit()
    conn.close()


def update_job_description(job_id: int, description: str):
    """Overwrite the JD text (used when uploading a JD PDF)."""
    conn = get_conn()
    conn.execute(
        "UPDATE jobs SET description = ?, updated_at = datetime('now') WHERE id = ?",
        (description, job_id),
    )
    conn.commit()
    conn.close()


# ── Candidate CRUD ────────────────────────────────

def add_candidate(job_id: int, resume_text: str) -> int:
    """Insert a raw (unscreened) candidate. Returns its ID."""
    conn = get_conn()
    cursor = conn.execute(
        "INSERT INTO candidates (job_id, resume_text) VALUES (?, ?)",
        (job_id, resume_text),
    )
    cid = cursor.lastrowid
    conn.commit()
    conn.close()
    return cid


def get_candidates_for_job(job_id: int) -> list:
    """Return all candidates for a job, highest score first. JSON fields are parsed."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM candidates WHERE job_id = ? ORDER BY match_score DESC",
        (job_id,),
    ).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        for field in ("skills", "experience", "education", "projects",
                      "matched_skills", "missing_skills"):
            try:
                d[field] = json.loads(d[field])
            except (json.JSONDecodeError, TypeError):
                d[field] = []
        result.append(d)
    return result


def get_all_candidates() -> list:
    """Return every candidate across all jobs (for the Candidates page)."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT c.*, j.title AS job_title
        FROM candidates c
        JOIN jobs j ON c.job_id = j.id
        ORDER BY c.match_score DESC
    """).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        for field in ("skills", "experience", "education", "projects",
                      "matched_skills", "missing_skills"):
            try:
                d[field] = json.loads(d[field])
            except (json.JSONDecodeError, TypeError):
                d[field] = []
        result.append(d)
    return result


def get_unscreened_candidates(job_id: int) -> list:
    """Candidates whose resumes haven't been analyzed yet."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM candidates WHERE job_id = ? AND screened = 0",
        (job_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_candidate_analysis(candidate_id: int, data: dict):
    """Persist the Gemini extraction + match results for a candidate."""
    conn = get_conn()
    conn.execute("""
        UPDATE candidates SET
            name                = ?,
            email               = ?,
            phone               = ?,
            skills              = ?,
            experience          = ?,
            education           = ?,
            projects            = ?,
            match_score         = ?,
            matched_skills      = ?,
            missing_skills      = ?,
            experience_relevance= ?,
            justification       = ?,
            category            = ?,
            screened            = 1
        WHERE id = ?
    """, (
        data.get("name", "Unknown"),
        data.get("email", ""),
        data.get("phone", ""),
        json.dumps(data.get("skills", [])),
        json.dumps(data.get("experience", [])),
        json.dumps(data.get("education", [])),
        json.dumps(data.get("projects", [])),
        data.get("match_score", 0),
        json.dumps(data.get("matched_skills", [])),
        json.dumps(data.get("missing_skills", [])),
        data.get("experience_relevance", ""),
        data.get("justification", ""),
        data.get("category", "low"),
        candidate_id,
    ))
    conn.commit()
    conn.close()


# ── Activity & Dashboard ─────────────────────────

def log_activity(job_id: int | None, message: str):
    """Append an event to the activity feed."""
    conn = get_conn()
    conn.execute(
        "INSERT INTO activity_log (job_id, message) VALUES (?, ?)",
        (job_id, message),
    )
    conn.commit()
    conn.close()


def get_attention_candidates(limit: int = 5) -> list:
    """Candidates marked 'review' — they need a human decision."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT c.id, c.name, c.justification, c.category, c.match_score,
               c.job_id, j.title AS job_title
        FROM candidates c
        JOIN jobs j ON c.job_id = j.id
        WHERE c.category = 'review' AND c.screened = 1
        ORDER BY c.match_score DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_recent_activity(limit: int = 5) -> list:
    """Last N activity-log entries for the dashboard sidebar."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT a.*, j.title AS job_title
        FROM activity_log a
        LEFT JOIN jobs j ON a.job_id = j.id
        ORDER BY a.created_at DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_dashboard_stats() -> dict:
    """Aggregate numbers shown on the home dashboard."""
    conn = get_conn()
    stats = {
        "total_jobs":       conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],
        "total_candidates": conn.execute("SELECT COUNT(*) FROM candidates").fetchone()[0],
        "screened":         conn.execute("SELECT COUNT(*) FROM candidates WHERE screened = 1").fetchone()[0],
        "strong_matches":   conn.execute("SELECT COUNT(*) FROM candidates WHERE category = 'strong'").fetchone()[0],
    }
    conn.close()
    return stats
