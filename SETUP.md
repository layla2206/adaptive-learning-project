# 🚀 Project Setup Guide
## Adaptive Learning Tutor — Frontend (Student / Instructor / Admin)

Welcome! Follow this step-by-step guide to get the app running locally.

---

## 📋 Requirements Overview

| Component | Required Specification |
|---|---|
| **Node.js Version** | **`>= 20.9.0`** (LTS recommended — this repo was built on `v24.9.0`) |
| **Package Manager** | **`npm`** (comes with Node — this project does not use yarn/pnpm/bun) |
| **Editor / IDE** | **VS Code** (or any editor with TypeScript + ESLint support) |
| **API Keys** | **None required.** This app is currently frontend-only — every screen runs on mock data in `src/lib/*.ts` and in-browser state. There is no database and no `process.env` usage anywhere in the codebase. |

---

## 🛠️ Step 1: Install Node.js

If you don't already have Node 20.9+ installed:

* **macOS (via [nvm](https://github.com/nvm-sh/nvm), recommended):**
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  nvm install 20
  nvm use 20
  ```

* **Or download directly:** [nodejs.org](https://nodejs.org) (choose the LTS build)

* **Verify installation:**
  ```bash
  node -v   # should print v20.9.0 or higher
  npm -v
  ```

---

## 📦 Step 2: Install Dependencies

From the project root:

```bash
npm install
```

---

## 🔑 Step 3: Environment Configuration (`.env`)

There's nothing to fill in yet, but for consistency with the convention:

```bash
cp .env.example .env
```

See `.env.example` for details — it's a placeholder for when backend work (database, auth secrets) begins. The app runs fully without it today.

---

## 📓 Step 4: VS Code Configuration

1. Install the recommended extensions:
   - **ESLint** (`dbaeumer.vscode-eslint`)
2. Open the project folder — TypeScript and Next.js support work out of the box, no interpreter/environment selection needed (unlike a Python project).

---

## ▶️ Step 5: Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Key routes to try:

| Route | Screen |
|---|---|
| `/` | Marketing home |
| `/signup` | Student sign-up flow (ID → OTP → password) |
| `/dashboard` | Student dashboard |
| `/subject/dsa` | Subject milestone journey |
| `/subject/dsa/topic/graphs` | Topic tutor loop |
| `/score` | Weekly calendar + trophy cabinet |
| `/instructor` | Instructor dashboard |
| `/instructor/courses/cs201` | Instructor content upload |
| `/admin` | Admin panel |

---

## ✅ Step 6: Verify Your Environment

Run the same checks used throughout development — if both pass, your environment is ready:

```bash
npm run build
npm run lint
```

If `npm run build` finishes with a route table printed and `npm run lint` reports no errors, you're completely ready to work on the project.
