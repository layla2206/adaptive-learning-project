"""
One-off: compares each flagged near-duplicate pair by actual extracted text
content (not just filename), so we're not skipping real content on a guess.

Run from backend/, with the venv active:
    source .venv/bin/activate && python scripts/check_duplicates.py
"""
import sys
import os
import re
import difflib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import s3_client, r2_bucket_name, parse_document  # noqa: E402

COURSE_ID = "cs301"

PAIRS = [
    ("GUC_351_58_22933_2022-11-28T12_20_08.pdf", "GUC_351_58_22933_2022-11-28T12_20_08 (1).pdf"),
    ("GUC_351_58_22927_2022-10-11T10_18_36.pdf", "GUC_351_58_22927_2022-10-12T14_06_57.pdf"),
    ("GUC_351_58_22926_2022-10-05T18_19_21.pdf", "GUC_351_58_22926_2022-10-03T10_35_54.pdf"),
    ("GUC_351_61_37319_2023-10-25T11_53_16.pdf", "GUC_351_61_37319_2023-11-10T11_32_42.pdf"),
    ("GUC_351_58_22925_2022-09-25T09_45_14.pdf", "GUC_351_58_22925_2022-09-28T18_57_56.pdf"),
]


def sanitize(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", name)


def find_r2_key(file_name: str):
    sanitized = sanitize(file_name)
    prefix = f"courses/{COURSE_ID}/"
    resp = s3_client.list_objects_v2(Bucket=r2_bucket_name, Prefix=prefix)
    for obj in resp.get("Contents", []):
        if obj["Key"].endswith(sanitized):
            return obj["Key"]
    return None


def fetch_text(file_name: str):
    key = find_r2_key(file_name)
    if not key:
        return None, f"not found in R2 (looked for suffix {sanitize(file_name)})"
    obj = s3_client.get_object(Bucket=r2_bucket_name, Key=key)
    file_bytes = obj["Body"].read()
    try:
        text = parse_document(file_bytes, "pdf")
    except Exception as e:
        return None, f"parse failed: {e}"
    return text, len(file_bytes)


for a, b in PAIRS:
    print(f"\n=== {a}\n vs {b} ===")
    text_a, meta_a = fetch_text(a)
    text_b, meta_b = fetch_text(b)

    if text_a is None:
        print(f"  A: {meta_a}")
        continue
    if text_b is None:
        print(f"  B: {meta_b}")
        continue

    print(f"  A: {meta_a} bytes, {len(text_a)} chars extracted")
    print(f"  B: {meta_b} bytes, {len(text_b)} chars extracted")

    if text_a.strip() == text_b.strip():
        print("  -> IDENTICAL extracted text. Same content, different export.")
    else:
        ratio = difflib.SequenceMatcher(None, text_a, text_b).ratio()
        print(f"  -> extracted text differs. Similarity ratio: {ratio:.3f}")
        if ratio > 0.95:
            print("     Effectively identical (minor re-export noise) — safe to treat as duplicate.")
        elif ratio > 0.7:
            print("     Substantially overlapping but not identical — spot-check manually before skipping.")
        else:
            print("     Meaningfully different content — do NOT skip, this is not a duplicate.")
