import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  throw new Error(
    "GMAIL_USER / GMAIL_APP_PASSWORD are not set in .env — auth routes cannot send OTP or verification emails without them."
  );
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

const FROM = `Adaptive Learning Tutor <${GMAIL_USER}>`;

export async function sendOtpEmail(to: string, code: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Your sign-up verification code",
    text: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  });
}

export async function sendInstructorVerificationEmail(to: string, verifyUrl: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Verify your instructor account",
    text: `Verify your account to finish setting up your instructor login: ${verifyUrl}\n\nThis link expires in 30 minutes.`,
  });
}
