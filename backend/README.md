# Adaptive Tutor Backend

The backend is built with Python and FastAPI. It handles Document Ingestion, Retrieval-Augmented Generation (RAG), and Tutor AI endpoints.

## Local Setup

We use a standard Python virtual environment.

1. **Create the virtual environment**:
   ```bash
   python -m venv venv
   ```

2. **Activate the virtual environment**:
   - On Windows: `venv\Scripts\activate`
   - On macOS/Linux: `source venv/bin/activate`

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables**:
   Create a `.env` file in the root or inside the `backend` folder containing your local credentials.
   
   **CRITICAL: Gemini API Keys and Quotas**
   You **must** use your own personal API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
   - `GEMINI_API_KEY="YOUR_PERSONAL_KEY_HERE"`
   - *Do not share keys!* The free tier has strict limits:
     - **Generation**: 20 requests per day (we use `gemini-3.6-flash`).
     - **Embeddings**: 100 requests per minute (we use `gemini-embedding-001`).
   
   **RAG Configuration**:
   - `RAG_SIMILARITY_THRESHOLD`: Default is `0.7`. Controls how strict cosine similarity filtering is during document chunk retrieval.

## Running the Server

Run the development server via FastAPI:

```bash
fastapi dev main.py
```
Or via uvicorn directly:
```bash
uvicorn main:app --reload
```

## Supported Features

- **Document Ingestion**: Parsing uploaded courses (`.pdf`, `.txt`, `.md`, `.csv`, `.json`, `.docx`, `.pptx`) and splitting into chunks. 
  - *Note on Office Docs*: `.docx` and `.pptx` are parsed using pure Python standard libraries (`zipfile` & `xml.etree.ElementTree`) to bypass Enterprise Windows Application Control policies that block C-extensions like `lxml`.
- **RAG + Embeddings**: Using pgvector to retrieve relevant context.
- **Tutor Generation**: Generates contextual explanations and handles recent hint and session-resume endpoints.
