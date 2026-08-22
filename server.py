"""
server.py — FastAPI backend for ResumeScreen.

Responsibilities:
  1. Serve the static frontend (index.html, style.css, app.js)
  2. CRUD endpoints for jobs and candidates
  3. PDF → text extraction via pdfplumber
  4. Resume analysis via Google Gemini 2.0 Flash
     (structured extraction + semantic matching in one LLM call per resume)
  5. Dashboard aggregation endpoint

The Gemini API key is stored in-memory only (never written to disk).
"""

from contextlib import asynccontextmanager
from typing import Optional
import io
import json
import time
import os

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pdfplumber

import database as db

# ── Pydantic schemas for Gemini structured output ─────────

class WorkExperience(BaseModel):
    company: str
    role: str
    duration: str
    highlights: list[str]

class Education(BaseModel):
    institution: str
    degree: str
    field: str
    year: str

class Project(BaseModel):
    name: str
    description: str
    technologies: list[str]

class CandidateAnalysis(BaseModel):
    """Combined extraction + matching result from Gemini."""
    name: str
    email: str
    phone: str
    skills: list[str]
    experience: list[WorkExperience]
    education: list[Education]
    projects: list[Project]
    match_score: int
    matched_skills: list[str]
    missing_skills: list[str]
    experience_relevance: str
    justification: str
    category: str


# ── Request body schemas ──────────────────────────────────

class CreateJobRequest(BaseModel):
    title: str
    description: str

class ApiKeyRequest(BaseModel):
    api_key: str

class TextResumeRequest(BaseModel):
    texts: list[str]


# ── Application setup ────────────────────────────────────

# In-memory API key store (never persisted)
gemini_key: dict[str, Optional[str]] = {"value": os.environ.get("GEMINI_API_KEY")}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise the database on startup."""
    db.init_db()
    yield


app = FastAPI(title="ResumeScreen API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helper functions ──────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Use pdfplumber to pull text from a PDF, preserving layout."""
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(layout=True)
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts).strip()


def analyze_candidate_with_gemini(resume_text: str, jd_text: str, api_key: str) -> dict:
    """
    Single Gemini call that:
      (a) extracts structured data from the resume, and
      (b) semantically matches it against the job description.

    Returns a dict matching the CandidateAnalysis schema.
    """
    # Lazy import so the server can start even without the SDK installed
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    prompt = f"""You are an expert resume analyst and technical recruiter.

TASK: Analyze the following resume against the given job description. Perform BOTH extraction and matching in a single pass.

═══ JOB DESCRIPTION ═══
{jd_text}

═══ RESUME ═══
{resume_text}

═══ INSTRUCTIONS ═══

STEP 1 — EXTRACT structured data from the resume:
  • name: The candidate's full name
  • email: Email address (empty string if not found)
  • phone: Phone number (empty string if not found)
  • skills: ALL technical skills, tools, frameworks, programming languages, and relevant soft skills mentioned
  • experience: Each position → company, role, duration, and 2-3 key highlights
  • education: Each entry → institution, degree, field, year
  • projects: Each project → name, brief description, technologies used

STEP 2 — MATCH the candidate against the job description:
  • match_score: Integer 0–100
  • matched_skills: Skills from the resume that satisfy JD requirements.
    Consider semantic equivalents (e.g. "React" ≡ "ReactJS", "ML" ≡ "Machine Learning",
    "Node" ≡ "Node.js", "Postgres" ≡ "PostgreSQL").
  • missing_skills: Skills the JD requires but the candidate lacks
  • experience_relevance: 1–2 sentence assessment of experience fit
  • justification: 2–3 sentences explaining why this score was assigned
  • category: "strong" if score ≥ 75, "review" if 50–74, "low" if < 50

Be accurate. Do NOT inflate scores. If data is not found, return empty strings / empty lists."""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=CandidateAnalysis,
        ),
    )

    if not response.text:
        raise ValueError("Gemini returned an empty response")

    return json.loads(response.text)


# ── API Endpoints ─────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "has_api_key": gemini_key["value"] is not None}


# ─ API Key ─

@app.post("/api/set-api-key")
async def set_api_key(request: ApiKeyRequest):
    """Verify and store the Gemini API key in memory."""
    from google import genai

    try:
        client = genai.Client(api_key=request.api_key)
        resp = client.models.generate_content(
            model="gemini-3.6-flash",
            contents="Reply with exactly: ok",
        )
        if not resp.text:
            raise ValueError("No response")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Key verification failed: {exc}")

    gemini_key["value"] = request.api_key
    return {"status": "ok", "message": "API key verified and saved"}


# ─ Jobs ─

@app.get("/api/jobs")
async def list_jobs():
    return {"jobs": db.get_all_jobs()}


@app.post("/api/jobs")
async def create_job(request: CreateJobRequest):
    if not request.title.strip() or not request.description.strip():
        raise HTTPException(400, "Title and description are required")
    job_id = db.create_job(request.title.strip(), request.description.strip())
    return {"id": job_id, "message": "Job created"}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: int):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    candidates = db.get_candidates_for_job(job_id)
    return {"job": job, "candidates": candidates}


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: int):
    if not db.get_job(job_id):
        raise HTTPException(404, "Job not found")
    db.delete_job(job_id)
    return {"message": "Job deleted"}


@app.post("/api/jobs/{job_id}/upload-jd")
async def upload_jd_as_pdf(job_id: int, file: UploadFile = File(...)):
    """Replace a job's description with text extracted from a PDF."""
    if not db.get_job(job_id):
        raise HTTPException(404, "Job not found")

    content = await file.read()
    try:
        text = extract_text_from_pdf(content)
    except Exception as exc:
        raise HTTPException(400, f"PDF parse error: {exc}")

    if not text:
        raise HTTPException(400, "No text could be extracted from the PDF")

    db.update_job_description(job_id, text)
    return {"message": "JD updated from PDF", "preview": text[:300]}


# ─ Resumes ─

@app.post("/api/jobs/{job_id}/resumes")
async def upload_resume_pdfs(job_id: int, files: list[UploadFile] = File(...)):
    """Upload one or more resume PDFs."""
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    added, errors = 0, []
    for f in files:
        try:
            raw = await f.read()
            text = extract_text_from_pdf(raw)
            if text:
                db.add_candidate(job_id, text)
                added += 1
            else:
                errors.append(f"{f.filename}: no text extracted")
        except Exception as exc:
            errors.append(f"{f.filename}: {exc}")

    if added:
        db.log_activity(job_id, f"{added} new resume(s) added to {job['title']}")

    return {"added": added, "errors": errors}


@app.post("/api/jobs/{job_id}/resumes-text")
async def upload_resume_texts(job_id: int, request: TextResumeRequest):
    """Upload resumes as plain text (one string per resume)."""
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    added = 0
    for text in request.texts:
        if text.strip():
            db.add_candidate(job_id, text.strip())
            added += 1

    if added:
        db.log_activity(job_id, f"{added} new resume(s) added to {job['title']}")

    return {"added": added}


# ─ Screening ─

@app.post("/api/jobs/{job_id}/screen")
def screen_candidates(job_id: int):
    """
    Analyse every unscreened candidate for a job using Gemini.

    This endpoint is deliberately synchronous (def, not async def) so FastAPI
    runs it in a thread pool — the blocking Gemini calls won't stall the event
    loop.  A 4-second sleep between calls keeps us well under the free-tier
    rate limit of 15 RPM.
    """
    if not gemini_key["value"]:
        raise HTTPException(400, "API key not set. Go to Settings first.")

    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    unscreened = db.get_unscreened_candidates(job_id)
    if not unscreened:
        raise HTTPException(400, "No unscreened candidates to process")

    results, errors = [], []

    for idx, candidate in enumerate(unscreened):
        try:
            analysis = analyze_candidate_with_gemini(
                candidate["resume_text"],
                job["description"],
                gemini_key["value"],
            )
            db.update_candidate_analysis(candidate["id"], analysis)
            results.append({
                "candidate_id": candidate["id"],
                "name": analysis.get("name", "Unknown"),
                "score": analysis.get("match_score", 0),
                "category": analysis.get("category", "low"),
            })
        except Exception as exc:
            errors.append({"candidate_id": candidate["id"], "error": str(exc)})

        # Rate-limit pause (skip after last candidate)
        if idx < len(unscreened) - 1:
            time.sleep(4)

    # Log a summary to the activity feed
    if results:
        strong = sum(1 for r in results if r["category"] == "strong")
        review = sum(1 for r in results if r["category"] == "review")
        low    = sum(1 for r in results if r["category"] == "low")
        db.log_activity(
            job_id,
            f"Screening completed for {job['title']}: "
            f"{strong} strong, {review} review, {low} low",
        )

    return {
        "screened": len(results),
        "errors": errors,
        "candidates": db.get_candidates_for_job(job_id),
    }


# ─ Dashboard ─

@app.get("/api/dashboard")
async def dashboard():
    return {
        "stats":     db.get_dashboard_stats(),
        "jobs":      db.get_all_jobs(),
        "attention": db.get_attention_candidates(),
        "activity":  db.get_recent_activity(),
    }


# ─ All candidates ─

@app.get("/api/candidates")
async def all_candidates():
    return {"candidates": db.get_all_candidates()}


# ── Static file serving & SPA fallback ────────────────────

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ── Entrypoint ────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
