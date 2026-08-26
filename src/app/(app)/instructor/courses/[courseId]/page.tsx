"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { courses, uploadedFilesByCourse, instructorProfile, type UploadedFile } from "@/lib/instructorData";
import AppHeader from "@/components/AppHeader";
import { UploadIcon, CheckIcon, RefreshIcon } from "@/components/icons";
import styles from "./page.module.css";

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

const IN_FLIGHT: UploadedFile["status"][] = ["uploading", "tagging", "failed"];

export default function CourseUploadPage() {
  const params = useParams<{ courseId: string }>();
  const course = courses.find((c) => c.id === params.courseId);

  const [files, setFiles] = useState<UploadedFile[]>(() => uploadedFilesByCourse[params.courseId] ?? []);
  const [isDragging, setIsDragging] = useState(false);
  const [rejections, setRejections] = useState<string[]>([]);
  const [taggingDraft, setTaggingDraft] = useState<Record<string, string>>({});
  const [retagId, setRetagId] = useState<string | null>(null);
  const [retagLecture, setRetagLecture] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fileMap, setFileMap] = useState<Map<string, File>>(new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!course) {
    return (
      <div className={`shell ${styles.page}`}>
        <div className={styles.notFound}>
          <p>Course not found.</p>
          <Link href="/instructor">Back to instructor dashboard</Link>
        </div>
      </div>
    );
  }

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  async function uploadToR2(id: string, fileObj: File) {
    try {
      // Simulate incremental progress UI while upload is starting
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress: 35 } : f)));

      const formData = new FormData();
      formData.append("file", fileObj);
      formData.append("courseId", params.courseId);
      formData.append("instructorId", "550e8400-e29b-41d4-a716-446655440000");

      const response = await fetch("/api/upload", {
        method: "POST",
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
            ? { ...f, status: "tagging", progress: 100, documentId: result.documentId, r2Key: result.r2Key }
            : f
        )
      );
    } catch (err: any) {
      console.error("Upload error:", err);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: "failed", progress: 100, errorReason: err.message || "Upload failed — try again." }
            : f
        )
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

  function handleTagChange(id: string, value: string) {
    setTaggingDraft((prev) => ({ ...prev, [id]: value }));
  }

  function handleConfirmTag(id: string) {
    const value = taggingDraft[id];
    if (!value || !value.trim()) return;
    const fileName = files.find((f) => f.id === id)?.name ?? "File";
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, lectureNumber: Number(value), status: "ready" } : f)));
    setTaggingDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    showToast(`${fileName} saved for Lecture ${value}`);
  }

  function handleStartRetag(file: UploadedFile) {
    setRetagId(file.id);
    setRetagLecture(String(file.lectureNumber));
  }

  function handleConfirmRetag() {
    if (!retagId || !retagLecture.trim()) return;
    setFiles((prev) => prev.map((f) => (f.id === retagId ? { ...f, lectureNumber: Number(retagLecture) } : f)));
    setRetagId(null);
    setRetagLecture("");
  }

  async function handleRemove(id: string) {
    const fileToRemove = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setConfirmRemoveId(null);

    if (fileToRemove?.documentId && fileToRemove?.r2Key) {
      try {
        await fetch("/api/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: fileToRemove.documentId,
            r2Key: fileToRemove.r2Key,
          }),
        });
      } catch (err) {
        console.error("Failed to delete file from backend", err);
      }
    }
  }

  const inFlight = files.filter((f) => IN_FLIGHT.includes(f.status));
  const settled = files.filter((f) => !IN_FLIGHT.includes(f.status)).sort((a, b) => a.lectureNumber - b.lectureNumber);
  const orderedFiles = [...inFlight, ...settled];

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
              <button type="button" className={styles.retagSave} onClick={handleConfirmRetag}>
                Save
              </button>
              <button type="button" className={styles.retagCancel} onClick={() => setRetagId(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <p className={styles.rowMeta}>
              Lecture {file.lectureNumber} · {file.uploadedAt}
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
        userName={instructorProfile.name}
        backHref="/instructor"
        backLabel="Instructor Dashboard"
      />

      <p className={styles.roster}>{course.rosterSize} students enrolled</p>

      <div className={styles.sectionHead}>
        <h2>Upload Lecture Content</h2>
      </div>

      <div
        className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
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
        <button type="button" className={styles.browseButton} onClick={() => fileInputRef.current?.click()}>
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
