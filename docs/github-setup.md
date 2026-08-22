# Pushing This Repo to GitHub & Adding Collaborators

This has to run on a machine with `git` installed and a GitHub account logged in (I can't push on your behalf — there's no GitHub connection available in this session, and pushing needs your own GitHub authentication).

## Step 1 — Create an empty repo on GitHub

1. Go to github.com, click **New repository**.
2. Name it (e.g. `adaptive-learning-project`), set it to **Private** if you don't want it public yet.
3. **Do not** check "Add a README," "Add .gitignore," or "Choose a license" — this project already has those, and starting the GitHub repo empty avoids a merge conflict on first push.
4. Click **Create repository**. Copy the URL it gives you (looks like `https://github.com/<your-username>/adaptive-learning-project.git`).

## Step 2 — Push your local folder

**If you're using the zip delivered earlier in this conversation** (it's already a git repo with one commit):

```
unzip adaptive-learning-project.zip
cd adaptive-learning-project
git remote add origin https://github.com/<your-username>/adaptive-learning-project.git
git branch -M main
git push -u origin main
```

**If you have a different/updated local project folder that isn't a git repo yet:**

```
cd path/to/your/project-folder
git init
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/adaptive-learning-project.git
git branch -M main
git push -u origin main
```

If `git push` asks for credentials and rejects a password, GitHub now requires a personal access token or SSH key instead of your account password for this — if you hit that, it's worth checking GitHub's current docs for setting up a token, since the exact flow has changed over the years and I don't want to hand you outdated steps.

## Step 3 — Add collaborators

1. On the repo page, go to **Settings → Collaborators and teams**.
2. Click **Add people**, enter each teammate's GitHub username or the email tied to their GitHub account.
3. They'll get an invite (by email or a GitHub notification) and need to accept it before they have access.

If this repo ends up under a GitHub Organization (e.g., something Dell provides for the internship) rather than your personal account, access is often managed via **Teams** instead of per-repo collaborators — check with whoever administers that org, since permissions models can differ from a personal repo.

## After that

Everyone on the team clones with:

```
git clone https://github.com/<your-username>/adaptive-learning-project.git
```

and from then on it's normal `git pull` / `git add` / `git commit` / `git push` workflow.
