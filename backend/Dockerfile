# Docker (not Render's native Python runtime) is required here specifically
# because of WeasyPrint (backend/pdf_generation.py): it needs Pango, cairo,
# and gdk-pixbuf at runtime, and Render's native runtime builds without
# root/apt access, so those system libraries have no way to get installed.
# Docker gives us the apt-get layer below to provide them reliably.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render injects $PORT dynamically -- routed through sh -c so it's read at
# container start, not baked in at build time. Binds 0.0.0.0, not
# 127.0.0.1, since Render's router connects from outside the container.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
