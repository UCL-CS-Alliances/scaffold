// src/lib/email/enquiryMailer.ts
import nodemailer, { Transporter } from "nodemailer";
import FormData from "form-data";
import Mailgun from "mailgun.js"; 

type SendMailArgs = {
  from: string;
  to: string;
  cc: string[];
  reply_to: string;
  subject: string;
  text: string;
};

type SendMailResult = {
  messageId: string;
  previewUrl?: string;
};

let cachedTransporter: Transporter | null = null;

/**
 * Development mailer using Ethereal.
 * - Creates a test SMTP account and returns a preview URL.
 * - Suitable for local development and integration testing.
 *
 * Later (production): replace getTransporter() with a Microsoft Graph implementation.
 * - Keep the signature of sendMail() the same.
 * - Swap internals to Graph "sendMail".
 */
async function getTransporter(): Promise<Transporter> {
  if (cachedTransporter) return cachedTransporter;

  // Ethereal test account - no real email delivered; preview link provided.
  const testAccount = await nodemailer.createTestAccount();

  cachedTransporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return cachedTransporter;
}

export async function sendMail(args: SendMailArgs): Promise<SendMailResult> {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: args.from,
    to: args.to,
    cc: args.cc,
    subject: args.subject,
    text: args.text,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;

  return {
    messageId: info.messageId,
    previewUrl,
  };
}

export async function sendMailgun(args: SendMailArgs) {
  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({
    username: "api",
    key: process.env.MAILGUN_API_KEY!
  });

  const data = await mg.messages.create(process.env.MAILGUN_DOMAIN!, {
    from: args.from,
    to: args.to,
    cc: args.cc,
    "h:Reply-To": args.reply_to,
    subject: args.subject,
    text: args.text,
  });
}

/**
 * Microsoft Graph migration notes (later):
 * - Replace sendMail() internals to call Graph /users/{mailbox}/sendMail or /me/sendMail.
 * - You will need an Azure App Registration + permissions and a mailbox to send from.
 * - Keep the API route unchanged; only this module changes.
 */
