"use client";

import { useEffect, useState } from "react";
import { useTutorStore } from "@/lib/store";
import { getSession } from "@/lib/session";
import AppHeader from "@/components/AppHeader";
import { RETRY_FORMATS } from "@/lib/retryFormats";
import styles from "./page.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { userName } = useTutorStore();
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState("");
  const [coursesText, setCoursesText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    async function load() {
      const session = getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/student/settings", { headers: { Authorization: `Bearer ${session.token}` } });
      if (res.ok) {
        const data = await res.json();
        setFormat(data.preferredExplanationFormat ?? "");
        setCoursesText((data.priorCourses ?? []).join("\n"));
      }
      setLoading(false);
    }
    queueMicrotask(load);
  }, []);

  async function handleSave() {
    const session = getSession();
    if (!session) return;
    setSaveState("saving");
    const priorCourses = coursesText
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/student/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ preferredExplanationFormat: format || null, priorCourses }),
      });
      setSaveState(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className={`shell ${styles.page}`}>
      <AppHeader eyebrow="Preferences" title="Settings" userName={userName} backHref="/dashboard" backLabel="Dashboard" />

      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Favorite explanation format</h2>
        <p className={styles.hint}>Retry explanations will lead with this format when you get stuck.</p>
        {loading ? (
          <p className={styles.hint}>Loading…</p>
        ) : (
          <select className={styles.select} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="">No preference</option>
            {RETRY_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Prior courses</h2>
        <p className={styles.hint}>List any courses you&apos;ve taken before, one per line.</p>
        {loading ? (
          <p className={styles.hint}>Loading…</p>
        ) : (
          <textarea
            className={styles.textarea}
            rows={5}
            value={coursesText}
            onChange={(e) => setCoursesText(e.target.value)}
            placeholder={"Intro to Statistics\nCalculus I"}
          />
        )}
      </div>

      <div className={styles.saveRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSave}
          disabled={loading || saveState === "saving"}
        >
          {saveState === "saving" ? "Saving…" : "Save changes"}
        </button>
        {saveState === "saved" && <span className={styles.saved}>Saved</span>}
        {saveState === "error" && <span className={styles.errorMsg}>Couldn&apos;t save. Try again.</span>}
      </div>
    </div>
  );
}