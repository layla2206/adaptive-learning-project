"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { roster, maskEmail, MOCK_OTP, type RosterEntry } from "@/lib/authData";
import { ArrowIcon } from "@/components/icons";
import styles from "./page.module.css";

type Step = "id" | "otp" | "password";

const STEP_NUMBER: Record<Step, number> = { id: 1, otp: 2, password: 3 };
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

function passwordStrength(pw: string): "weak" | "medium" | "strong" | null {
  if (!pw) return null;
  if (pw.length < 6) return "weak";
  if (pw.length < 10) return "medium";
  return "strong";
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("id");

  const [studentId, setStudentId] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [entry, setEntry] = useState<RosterEntry | null>(null);

  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleIdContinue() {
    const trimmed = studentId.trim();
    const match = roster.find((r) => r.id.toLowerCase() === trimmed.toLowerCase());
    if (!match) {
      setIdError("We couldn't find that ID — check with your instructor if you think this is a mistake.");
      return;
    }
    setIdError(null);
    setEntry(match);
    setStep("otp");
    setCooldown(RESEND_COOLDOWN_S);
  }

  function handleOtpChange(i: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[i] = digit;
    setOtpDigits(next);
    setOtpError(null);
    if (digit && i < OTP_LENGTH - 1) otpRefs.current[i + 1]?.focus();
    if (digit && i === OTP_LENGTH - 1) {
      const code = next.join("");
      if (code.length === OTP_LENGTH) verifyOtp(code);
    }
  }

  function handleOtpKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpDigits[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  }

  function verifyOtp(code: string) {
    if (code !== MOCK_OTP) {
      setOtpError("That code didn't match — double-check and try again.");
      return;
    }
    setOtpError(null);
    setStep("password");
  }

  function handleResend() {
    if (cooldown > 0) return;
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setOtpError(null);
    setCooldown(RESEND_COOLDOWN_S);
    otpRefs.current[0]?.focus();
  }

  function handlePasswordSubmit() {
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Those passwords don't match — give it another try.");
      return;
    }
    setPasswordError(null);
    router.push("/dashboard");
  }

  const strength = passwordStrength(password);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.logo}>
          Tutor
        </Link>

        <div className={styles.progress}>
          <p className={styles.stepLabel}>Step {STEP_NUMBER[step]} of 3</p>
          <div className={styles.dots}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={`${styles.dot} ${n <= STEP_NUMBER[step] ? styles.dotActive : ""}`} />
            ))}
          </div>
        </div>

        {step === "id" && (
          <div className={styles.stepBody}>
            <h1 className={styles.title}>What&apos;s your student ID?</h1>
            <p className={styles.subtitle}>We&apos;ll match you to your enrolled courses automatically.</p>

            <label className={styles.fieldLabel} htmlFor="student-id">
              Student ID
            </label>
            <input
              id="student-id"
              className={styles.input}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleIdContinue()}
              placeholder="e.g. 21-0001"
              autoFocus
            />
            {idError && <p className={styles.fieldError}>{idError}</p>}

            <button type="button" className={styles.primaryButton} onClick={handleIdContinue} disabled={!studentId.trim()}>
              Continue
              <ArrowIcon size={14} />
            </button>
          </div>
        )}

        {step === "otp" && entry && (
          <div className={styles.stepBody}>
            <h1 className={styles.title}>Check your email</h1>
            <p className={styles.subtitle}>
              We sent a 6-digit code to <strong>{maskEmail(entry.email)}</strong>. It expires in 10 minutes.
            </p>

            <div className={styles.otpRow}>
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  className={styles.otpBox}
                  value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  inputMode="numeric"
                  maxLength={1}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {otpError && <p className={styles.fieldError}>{otpError}</p>}

            <button
              type="button"
              className={styles.resendButton}
              onClick={handleResend}
              disabled={cooldown > 0}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        )}

        {step === "password" && (
          <div className={styles.stepBody}>
            <h1 className={styles.title}>Create a password</h1>
            <p className={styles.subtitle}>Last step — then you&apos;re straight into your dashboard.</p>

            <label className={styles.fieldLabel} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {strength && (
              <div className={styles.strengthWrap}>
                <div className={styles.strengthTrack}>
                  <div className={`${styles.strengthFill} ${styles[`strength_${strength}`]}`} />
                </div>
                <span className={`${styles.strengthLabel} ${styles[`strength_${strength}`]}`}>{strength}</span>
              </div>
            )}

            <label className={styles.fieldLabel} htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
            />
            {passwordError && <p className={styles.fieldError}>{passwordError}</p>}

            <button
              type="button"
              className={styles.primaryButton}
              onClick={handlePasswordSubmit}
              disabled={!password || !confirmPassword}
            >
              Create account
              <ArrowIcon size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
