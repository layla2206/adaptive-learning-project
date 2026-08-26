# 🚀 Project Setup Guide
## Adaptive Learning Tutor (Next.js + FastAPI Backend)

Welcome! Follow this step-by-step guide to get the app running locally. Our architecture uses a **Next.js frontend** that proxies heavy data-processing requests (like document chunking, embeddings, and diagnostic generation) to a **Python FastAPI backend**.

---

## 📋 Requirements Overview

| Component | Required Specification |
|---|---|
| **Node.js Version** | **`>= 20.9.0`** (LTS recommended) |
| **Python Version** | **`>= 3.9`** |
| **Package Managers**| **`npm`** (for frontend) and **`pip`** (for backend) |
| **Editor / IDE** | **VS Code** (with TypeScript and Python extensions) |

---

## 🔑 Environment Configuration (`.env.local`)

You will need real API keys now that the backend is wired up to Supabase, Cloudflare R2, and Google Gemini! 
Copy the example file to create your local environment file:

```bash
cp .env.example .env.local
```

You must fill in the following variables in `.env.local` for the backend to work:
* `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
* `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
* `GEMINI_API_KEY`

---

## 🛠️ Step 1: Set up the Python Backend

Our FastAPI backend handles document ingestion, chunking, AI embedding generation, and diagnostic quiz creation.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   * **Windows:** `python -m venv venv` then `.\venv\Scripts\Activate.ps1`
   * **macOS/Linux:** `python3 -m venv venv` then `source venv/bin/activate`
3. Install the required Python packages (listed in `backend/requirements.txt`):
   ```bash
   pip install -r requirements.txt
   ```
4. Run the FastAPI development server (it runs on port 8000 by default):
   ```bash
   uvicorn main:app --reload
   ```

*(Keep this terminal window running!)*

---

## 📦 Step 2: Set up the Next.js Frontend

Open a **new terminal window** and navigate to the project root:

1. Install frontend dependencies:
   ```bash
   npm install
   ```
2. Run the Next.js development server:
   ```bash
   npm run dev
   ```

*(Keep this terminal window running!)*

---

## ▶️ Step 3: Verify the Application

Open [http://localhost:3000](http://localhost:3000) in your browser. 

The Next.js frontend is now successfully proxying requests to your FastAPI backend! You can test this by navigating to the Instructor Dashboard (`/instructor/courses/cs201`) and uploading a file. 

You can also view the auto-generated Swagger API documentation for the Python backend by visiting [http://localhost:8000/docs](http://localhost:8000/docs).
