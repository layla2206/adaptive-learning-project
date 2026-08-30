"""Renders generated practice/quiz/exam content to PDF via WeasyPrint --
HTML/CSS in, PDF bytes out, so the output can share basic typography with the
rest of the app instead of looking like a raw text dump. Two separate
documents per request (questions-only, answer-key-only) rather than one
combined PDF with a reveal toggle -- matches the "two downloadable PDFs" spec.

WeasyPrint needs system libraries (Pango, cairo, gdk-pixbuf, libffi) that a
plain `pip install weasyprint` does not provide -- see requirements.txt.
Confirmed working locally via Homebrew (`brew install pango`), but on macOS
those libs aren't on the default dlopen path, so the process needs
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib set before weasyprint is
imported. The deploy target (Render) needs the equivalent apt packages
(libpango-1.0-0, libpangocairo-1.0-0, libgdk-pixbuf2.0-0, libffi-dev,
shared-mime-info) available at build/runtime -- unverified, flagged in the
feature plan, not assumed to just work.
"""

import html
import os
import sys

if sys.platform == "darwin" and not os.environ.get("DYLD_FALLBACK_LIBRARY_PATH"):
    # Homebrew's Pango/cairo/gdk-pixbuf aren't on the default dlopen path on
    # macOS -- WeasyPrint's cffi dlopen calls fail without this. Harmless
    # elsewhere: only applied on darwin, and only if nothing already set it.
    os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = "/opt/homebrew/lib:/usr/local/lib"

from weasyprint import HTML

_BASE_CSS = """
@page { size: Letter; margin: 1in; }
body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
header { margin-bottom: 24px; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; }
header .eyebrow { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin: 0 0 4px; }
header h1 { font-size: 18pt; margin: 0; }
.question { margin-bottom: 20px; page-break-inside: avoid; }
.question .num { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #555; margin: 0 0 4px; }
.question p.text { margin: 0 0 8px; font-size: 12pt; }
.options { list-style: upper-alpha; margin: 0; padding-left: 22px; }
.answer { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #333; background: #f4f4f4; padding: 8px 12px; border-left: 3px solid #1a1a1a; margin-top: 6px; white-space: pre-wrap; }
.answer.code { font-family: 'Courier New', Courier, monospace; }
.answer-space { border: 1px dashed #999; border-radius: 4px; padding: 8px 12px; margin-top: 6px; color: #888; font-family: Helvetica, Arial, sans-serif; font-size: 9pt; min-height: 70px; }
.answer-space.code-space { font-family: 'Courier New', Courier, monospace; min-height: 110px; background: #fafafa; }
"""

_TYPE_LABELS = {"multiple_choice": "Multiple Choice", "short_answer": "Short Answer", "code": "Code"}


def _esc(value) -> str:
    return html.escape(str(value)) if value is not None else ""


def _header_html(eyebrow: str, title: str) -> str:
    return f"""<header>
  <p class="eyebrow">{_esc(eyebrow)}</p>
  <h1>{_esc(title)}</h1>
</header>"""


def _is_mc(content_type: str) -> bool:
    return content_type in ("quiz", "final_exam")


def _question_type(content_type: str, q: dict) -> str:
    """Per-question type, defaulting by content_type for legacy cached
    payloads generated before quiz/exam supported mixed question types."""
    q_type = q.get("question_type")
    if q_type in _TYPE_LABELS:
        return q_type
    return "multiple_choice" if _is_mc(content_type) else "short_answer"


def render_questions_pdf(content_type: str, eyebrow: str, title: str, questions: list[dict]) -> bytes:
    """Question text (and MC options, no correct answer marked) only."""
    blocks = []
    for i, q in enumerate(questions, start=1):
        q_type = _question_type(content_type, q)
        meta = [f"Question {i} of {len(questions)}"]
        if q.get("difficulty"):
            meta.append(_esc(q["difficulty"]))
        if _is_mc(content_type):
            meta.append(_TYPE_LABELS[q_type])
        body = f"""<div class="question">
  <p class="num">{" &middot; ".join(meta)}</p>
  <p class="text">{_esc(q["question_text"])}</p>"""
        if q_type == "multiple_choice":
            options = "".join(f"<li>{_esc(opt)}</li>" for opt in q.get("options", []))
            body += f'<ol class="options">{options}</ol>'
        elif q_type == "code":
            body += '<div class="answer-space code-space">Write your code here</div>'
        else:
            body += '<div class="answer-space">Write your answer here</div>'
        body += "</div>"
        blocks.append(body)

    document = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>{_BASE_CSS}</style></head>
<body>{_header_html(eyebrow, title)}{"".join(blocks)}</body></html>"""
    return HTML(string=document).write_pdf()


def render_answer_key_pdf(content_type: str, eyebrow: str, title: str, questions: list[dict]) -> bytes:
    """Question number + correct answer / model answer, paired for lookup."""
    blocks = []
    for i, q in enumerate(questions, start=1):
        q_type = _question_type(content_type, q)
        answer = q.get("correct_answer") if _is_mc(content_type) else q.get("model_answer")
        answer_class = "answer code" if q_type == "code" else "answer"
        body = f"""<div class="question">
  <p class="num">Question {i} of {len(questions)}</p>
  <p class="text">{_esc(q['question_text'])}</p>
  <div class="{answer_class}">{_esc(answer)}</div>
</div>"""
        blocks.append(body)

    document = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>{_BASE_CSS}</style></head>
<body>{_header_html(f"{eyebrow} · Answer Key", title)}{"".join(blocks)}</body></html>"""
    return HTML(string=document).write_pdf()
