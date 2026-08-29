"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import type { CourseTopic, DocumentType, UploadedFile } from "@/lib/instructorData";
import AppHeader from "@/components/AppHeader";
import { UploadIcon, CheckIcon, RefreshIcon } from "@/components/icons";
import styles from "./page.module.css";

interface CourseInfo {
  id: string;
  name: string;
  rosterSize: number;
  instructorName: string;
  topics: CourseTopic[];
}

const NO_TOPIC = "";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".pptx"];
const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const TOAST_MS = 3000;

let fileIdSeq = 0;
function nextFileId() {
  fileIdSeq += 1;
  return `upload-${fileIdSeq}`;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function extensionOf(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

function validateFile(file: File): string | null {
  const ok = ACCEPTED_EXTENSIONS.includes(extensionOf(file.name)) && file.size <= MAX_SIZE_BYTES;
  return ok ? null : `PDF, DOCX, or PPTX only, up to 25MB — ${file.name} wasn't added.`;
}

const IN_FLIGHT: UploadedFile["status"][] = ["uploading", "failed"];

function TopicSelect({
  id,
  value,
  topics,
  onChange,
}: {
  id: string;
  value: string;
  topics: CourseTopic[];
  onChange: (value: string) => void;
}) {
  return (
    <select id={id} className={styles.tagInput} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value={NO_TOPIC}>No topic</option>
      {topics.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export default function CourseUploadPage() {
  const params = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [rejections, setRejections] = useState<string[]>([]);
  const [taggingDraft, setTaggingDraft] = useState<Record<string, string>>({});
  const [taggingTopicDraft, setTaggingTopicDraft] = useState<Record<string, string>>({});
  const [retagId, setRetagId] = useState<string | null>(null);
  const [retagLecture, setRetagLecture] = useState("");
  const [retagTopicId, setRetagTopicId] = useState(NO_TOPIC);
  const [retagDocumentType, setRetagDocumentType] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fileMap, setFileMap] = useState<Map<string, File>>(new Map());

  const [rosterStudentId, setRosterStudentId] = useState("");
  const [rosterName, setRosterName] = useState("");
  const [rosterEmail, setRosterEmail] = useState("");
  const [rosterSubmitting, setRosterSubmitting] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      const session = getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const headers = { Authorization: `Bearer ${session.token}` };
      const [courseData, fileData] = await Promise.all([
        fetch(`/api/instructor/courses/${params.courseId}`, { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/instructor/courses/${params.courseId}/files`, { headers }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setCourse(courseData);
      setFiles(fileData ?? []);
      setLoading(false);
    }
    queueMicrotask(load);
  }, [params.courseId]);

  if (!loading && !course) {
    return (
      <div className={`shell ${styles.page}`}>
        <div className={styles.notFound}>
          <p>Course not found.</p>
          <Link href="/instructor">Back to instructor dashboard</Link>
        </div>
      </div>
    );
  }
  if (!course) {
    return <div className={`shell ${styles.page}`} />;
  }

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  async function uploadToR2(id: string, fileObj: File) {
    const session = getSession();
    if (!session) return;
    try {
      // Simulate incremental progress UI while upload is starting
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress: 35 } : f)));

      const formData = new FormData();
      formData.append("file", fileObj);
      formData.append("courseId", params.courseId);
      // instructorId is derived server-side from the session in /api/upload — no need to send it.

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      const result = await response.json();
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                id: result.documentId,
                status: "tagging",
                progress: 100,
                documentId: result.documentId,
                r2Key: result.r2Key,
              }
            : f
        )
      );
      setFileMap((prev) => {
        const next = new Map(prev);
        const fileEntry = next.get(id);
        next.delete(id);
        if (fileEntry) next.set(result.documentId, fileEntry);
        return next;
      });
    } catch (err) {
      console.error("Upload error:", err);
      const message = err instanceof Error ? err.message : "Upload failed — try again.";
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "failed", progress: 100, errorReason: message } : f))
      );
    }
  }

  function handleFilesPicked(list: FileList | null) {
    if (!list || list.length === 0) return;
    const rejected: string[] = [];
    const newFileMap = new Map(fileMap);

    Array.from(list).forEach((file) => {
      const error = validateFile(file);
      if (error) {
        rejected.push(error);
        return;
      }
      const id = nextFileId();
      newFileMap.set(id, file);
      setFiles((prev) => [
        { id, name: file.name, lectureNumber: 0, uploadedAt: todayLabel(), status: "uploading", progress: 10 },
        ...prev,
      ]);
      uploadToR2(id, file);
    });

    setFileMap(newFileMap);
    setRejections(rejected);
  }

  function handleRetryUpload(id: string) {
    const fileObj = fileMap.get(id);
    if (!fileObj) return;
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: "uploading", progress: 10, errorReason: undefined } : f)));
    uploadToR2(id, fileObj);
  }

  async function patchDocument(
    documentId: string,
    updates: { lectureNumber?: number; topicId?: string | null; documentType?: string | null }
  ): Promise<boolean> {
    const session = getSession();
    if (!session) return false;
    const res = await fetch(`/api/instructor/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify(updates),
    });
    return res.ok;
  }

  function handleTagChange(id: string, value: string) {
    setTaggingDraft((prev) => ({ ...prev, [id]: value }));
  }

  function handleTagTopicChange(id: string, value: string) {
    setTaggingTopicDraft((prev) => ({ ...prev, [id]: value }));
  }

  async function handleConfirmTag(id: string) {
    const value = taggingDraft[id];
    if (!value || !value.trim()) return;
    const lectureNumber = Number(value);
    const topicId = taggingTopicDraft[id] || NO_TOPIC;
    const fileName = files.find((f) => f.id === id)?.name ?? "File";

    const ok = await patchDocument(id, { lectureNumber, topicId: topicId || null });
    if (!ok) {
      showToast("Couldn't save that lecture — try again.");
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, lectureNumber, topicId: topicId || null, status: "ready" } : f)));
    setTaggingDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTaggingTopicDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    showToast(`${fileName} saved for Lecture ${value}`);
  }

  function handleStartRetag(file: UploadedFile) {
    setRetagId(file.id);
    setRetagLecture(String(file.lectureNumber));
    setRetagTopicId(file.topicId ?? NO_TOPIC);
    setRetagDocumentType(file.documentType ?? "");
  }

  async function handleConfirmRetag() {
    if (!retagId || !retagLecture.trim()) return;
    const lectureNumber = Number(retagLecture);
    const topicId = retagTopicId || null;
    const documentType = (retagDocumentType || null) as DocumentType | null;
    const ok = await patchDocument(retagId, { lectureNumber, topicId, documentType });
    if (!ok) {
      showToast("Couldn't save that lecture — try again.");
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === retagId ? { ...f, lectureNumber, topicId, documentType } : f)));
    setRetagId(null);
    setRetagLecture("");
    setRetagTopicId(NO_TOPIC);
    setRetagDocumentType("");
  }

  async function handleRemove(id: string) {
    const session = getSession();
    const fileToRemove = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setConfirmRemoveId(null);
    if (!session || !fileToRemove) return;

    // Files loaded from the DB only have `id` (which IS the document_id).
    // Freshly uploaded files also set `documentId`. Use whichever is available.
    const docId = fileToRemove.documentId ?? fileToRemove.id;

    try {
      const res = await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ documentId: docId }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch (err) {
      console.error("Failed to delete file from backend", err);
      showToast("Couldn't remove that file — try again.");
    }
  }

  async function handleAddStudent() {
    if (!rosterStudentId.trim() || !rosterName.trim() || !rosterEmail.trim() || rosterSubmitting) return;
    setRosterSubmitting(true);
    setRosterError(null);

    const session = getSession();
    if (!session) {
      setRosterError("Your session expired — sign in again.");
      setRosterSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`/api/instructor/courses/${params.courseId}/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          studentId: rosterStudentId.trim(),
          name: rosterName.trim(),
          email: rosterEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRosterError(data.error || "Something went wrong. Try again.");
        return;
      }
      showToast(`${rosterName.trim()} pre-approved — they can sign up with ID ${rosterStudentId.trim()}.`);
      setRosterStudentId("");
      setRosterName("");
      setRosterEmail("");
    } catch {
      setRosterError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setRosterSubmitting(false);
    }
  }

  const inFlight = files.filter((f) => IN_FLIGHT.includes(f.status));
  const settled = files.filter((f) => !IN_FLIGHT.includes(f.status)).sort((a, b) => a.lectureNumber - b.lectureNumber);
  const orderedFiles = [...inFlight, ...settled];
  const courseTopics = course.topics;
  const topicNameById = new Map(courseTopics.map((t) => [t.id, t.name]));

  function renderRow(file: UploadedFile) {
    if (file.status === "uploading") {
      return (
        <div key={`${file.id}-${file.status}`} className={styles.rowContent}>
          <div className={styles.rowMain}>
            <p className={styles.fileName}>{file.name}</p>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${file.progress ?? 0}%` }} />
            </div>
          </div>
          <span className={styles.progressLabel}>{Math.round(file.progress ?? 0)}%</span>
        </div>
      );
    }

    if (file.status === "tagging") {
      const draft = taggingDraft[file.id] ?? "";
      return (
        <div key={`${file.id}-${file.status}`} className={`${styles.rowContent} ${styles.rowTagging}`}>
          <div className={styles.rowMain}>
            <p className={styles.fileName}>{file.name}</p>
            <p className={styles.taggingHint}>Uploaded to Cloudflare R2 — assign it to a lecture to complete.</p>
          </div>
          <div className={styles.tagInline}>
            <label className={styles.tagLabel} htmlFor={`lecture-${file.id}`}>
              Lecture #
            </label>
            <input
              id={`lecture-${file.id}`}
              type="number"
              min={1}
              className={styles.tagInput}
              value={draft}
              onChange={(e) => handleTagChange(file.id, e.target.value)}
              autoFocus
            />
            <label className={styles.tagLabel} htmlFor={`topic-${file.id}`}>
              Topic
            </label>
            <TopicSelect
              id={`topic-${file.id}`}
              value={taggingTopicDraft[file.id] ?? NO_TOPIC}
              topics={courseTopics}
              onChange={(value) => handleTagTopicChange(file.id, value)}
            />
            <button
              type="button"
              className={styles.saveButton}
              onClick={() => handleConfirmTag(file.id)}
              disabled={!draft.trim()}
            >
              Save
            </button>
          </div>
        </div>
      );
    }

    if (file.status === "failed") {
      return (
        <div key={`${file.id}-${file.status}`} className={`${styles.rowContent} ${styles.rowFailed}`}>
          <div className={styles.rowMain}>
            <p className={styles.fileName}>{file.name}</p>
            <p className={styles.errorText}>{file.errorReason ?? "Upload failed."}</p>
          </div>
          <button type="button" className={styles.retryButton} onClick={() => handleRetryUpload(file.id)}>
            <RefreshIcon size={13} />
            Retry
          </button>
        </div>
      );
    }

    const isRetagging = retagId === file.id;
    const isConfirmingRemove = confirmRemoveId === file.id;

    return (
      <div key={`${file.id}-${file.status}`} className={styles.rowContent}>
        <div className={styles.rowMain}>
          <p className={styles.fileName}>{file.name}</p>
          {isRetagging ? (
            <div className={styles.retagRow}>
              <input
                type="number"
                min={1}
                className={styles.retagInput}
                value={retagLecture}
                onChange={(e) => setRetagLecture(e.target.value)}
                autoFocus
              />
              <TopicSelect
                id={`retag-topic-${file.id}`}
                value={retagTopicId}
                topics={courseTopics}
                onChange={setRetagTopicId}
              />
              <select
                id={`retag-type-${file.id}`}
                className={styles.retagInput}
                value={retagDocumentType}
                onChange={(e) => setRetagDocumentType(e.target.value)}
              >
                <option value="">Type: none</option>
                <option value="practice_assignment">Practice Assignment</option>
                <option value="quiz">Quiz</option>
              </select>
              <button type="button" className={styles.retagSave} onClick={handleConfirmRetag}>
                Save
              </button>
              <button type="button" className={styles.retagCancel} onClick={() => setRetagId(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <p className={styles.rowMeta}>
              Lecture {file.lectureNumber} · {file.uploadedAt} ·{" "}
              {file.topicId ? (topicNameById.get(file.topicId) ?? "Unknown topic") : "Untagged"}
              {file.documentType ? ` · ${file.documentType === "quiz" ? "Quiz" : "Practice Assignment"}` : ""}
            </p>
          )}
        </div>

        <span className={`${styles.statusChip} ${styles[file.status]}`}>
          {file.status === "ready" && <CheckIcon size={11} />}
          {file.status === "ready" ? "Ready" : "Processing"}
        </span>

        <div className={styles.rowActions}>
          {isConfirmingRemove ? (
            <span className={styles.confirmRow}>
              <span className={styles.confirmText}>Remove this file?</span>
              <button type="button" className={styles.confirmYes} onClick={() => handleRemove(file.id)}>
                Yes, remove
              </button>
              <button type="button" className={styles.confirmNo} onClick={() => setConfirmRemoveId(null)}>
                Cancel
              </button>
            </span>
          ) : (
            <>
              {!isRetagging && (
                <button type="button" className={styles.rowAction} onClick={() => handleStartRetag(file)}>
                  Re-tag
                </button>
              )}
              <button type="button" className={styles.rowAction} onClick={() => setConfirmRemoveId(file.id)}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`shell ${styles.page}`}>
      <AppHeader
        eyebrow="Course"
        title={course.name}
        userName={course.instructorName}
        backHref="/instructor"
        backLabel="Instructor Dashboard"
      />

      <p className={styles.roster}>{course.rosterSize} students enrolled</p>

      <div id="add-students" className={styles.sectionHead}>
        <h2>Add a Student</h2>
      </div>
      <p className={styles.taggingHint}>
        Pre-approves this student to sign up for {course.name} with their school ID. They won&apos;t appear in the
        enrolled count above until they finish signing up.
      </p>
      <div className={styles.tagInline}>
        <input
          className={styles.rosterInput}
          placeholder="Student ID (e.g. S10293)"
          value={rosterStudentId}
          onChange={(e) => setRosterStudentId(e.target.value)}
        />
        <input
          className={styles.rosterInput}
          placeholder="Full name"
          value={rosterName}
          onChange={(e) => setRosterName(e.target.value)}
        />
        <input
          className={styles.rosterInput}
          type="email"
          placeholder="Email"
          value={rosterEmail}
          onChange={(e) => setRosterEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddStudent()}
        />
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleAddStudent}
          disabled={!rosterStudentId.trim() || !rosterName.trim() || !rosterEmail.trim() || rosterSubmitting}
        >
          {rosterSubmitting ? "Adding…" : "Add"}
        </button>
      </div>
      {rosterError && <p className={styles.errorText}>{rosterError}</p>}

      <div className={styles.sectionHead}>
        <h2>Upload Lecture Content</h2>
      </div>

      <div
        className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFilesPicked(e.dataTransfer.files);
        }}
      >
        <span className={styles.dropzoneIcon}>
          <UploadIcon size={22} />
        </span>
        <p className={styles.dropzoneTitle}>Drag and drop slides, PDFs, or readings</p>
        <p className={styles.dropzoneHint}>or</p>
        <button
          type="button"
          className={styles.browseButton}
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Browse files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className={styles.hiddenInput}
          onChange={(e) => {
            handleFilesPicked(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rejections.length > 0 && (
        <div className={styles.rejections}>
          {rejections.map((msg, i) => (
            <p key={i} className={styles.rejectionMessage}>
              {msg}
            </p>
          ))}
        </div>
      )}

      <div className={styles.sectionHead}>
        <h2>Course Files</h2>
      </div>

      {orderedFiles.length === 0 ? (
        <p className={styles.empty}>No files uploaded to this course yet.</p>
      ) : (
        <div className={styles.list}>{orderedFiles.map((file) => renderRow(file))}</div>
      )}

      {toast && (
        <div className={styles.toast}>
          <CheckIcon size={13} />
          {toast}
        </div>
      )}
    </div>
  );
}
