import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { ServerConfig, SmtpConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { readSetting, writeSetting } from './settings.js';

/** Mail server as entered under Settings → E-mail; overrides the `SMTP_*` environment variables. */
export const mailSettingsSchema = z.object({
  host: z.string().trim().max(200),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(200),
  /** Only sent to change it; `undefined` keeps the stored one, `''` removes it. */
  password: z.string().max(500).optional(),
  from: z.string().trim().max(200),
});
type StoredMail = Omit<z.infer<typeof mailSettingsSchema>, 'password'> & { password: string };

const MAIL = 'mail';

/** Mail server in effect: the settings when a host is entered there, else the environment. */
export function mailConfig(db: Db, config: ServerConfig): SmtpConfig | null {
  const stored = readSetting<StoredMail>(db, MAIL);
  if (stored?.host) {
    return {
      host: stored.host,
      port: stored.port,
      secure: stored.secure,
      user: stored.user || null,
      password: stored.password || null,
      from: stored.from || `PAM Analyzer <${stored.user || 'pam@localhost'}>`,
    };
  }
  return config.smtp;
}

/** For the settings page: never the password, only whether one is stored. */
export function getMailSettings(db: Db, config: ServerConfig) {
  const stored = readSetting<StoredMail>(db, MAIL);
  if (stored?.host) {
    const { password, ...rest } = stored;
    return { ...rest, passwordSet: Boolean(password), source: 'settings' as const };
  }
  const env = config.smtp;
  return {
    host: env?.host ?? '',
    port: env?.port ?? 587,
    secure: env?.secure ?? false,
    user: env?.user ?? '',
    from: env?.from ?? '',
    passwordSet: Boolean(env?.password),
    source: env ? ('environment' as const) : ('none' as const),
  };
}

export function setMailSettings(db: Db, input: z.infer<typeof mailSettingsSchema>, userId: number): void {
  const previous = readSetting<StoredMail>(db, MAIL);
  const { password, ...rest } = input;
  writeSetting(db, MAIL, { ...rest, password: password ?? previous?.password ?? '' }, userId);
}

function transportFor(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
  });
}

/** Test message from the settings page. */
export async function sendTestMail(smtp: SmtpConfig, to: string): Promise<void> {
  await transportFor(smtp).sendMail({
    from: smtp.from,
    to,
    subject: 'PAM Analyzer – Test',
    text: 'Diese Test-E-Mail bestätigt, dass der PAM Analyzer E-Mails versenden kann.\n\nThis test e-mail confirms that the PAM Analyzer can send e-mails.',
  });
}

export interface InviteMail {
  to: string;
  name: string;
  companyName: string;
  link: string;
  code: string;
  expiresAt: Date;
  locale: string;
}

/** Plain-text invitation in the member's language (German or English). */
export function inviteText(m: InviteMail): { subject: string; text: string } {
  const de = m.locale.startsWith('de');
  const until = m.expiresAt.toLocaleDateString(de ? 'de-DE' : 'en-GB');
  return de
    ? {
        subject: `Einladung zum PAM Analyzer (${m.companyName})`,
        text: [
          `Hallo ${m.name},`,
          '',
          `Sie wurden zum PAM Analyzer von ${m.companyName} eingeladen.`,
          '',
          `1. Passwort festlegen: ${m.link}`,
          `2. App verbinden: in der App „Mit dem Server verbinden“ den QR-Code aus dem Link scannen oder den Code ${m.code} eingeben.`,
          '',
          `Die Einladung gilt bis ${until} und kann nur einmal verwendet werden.`,
        ].join('\n'),
      }
    : {
        subject: `Invitation to PAM Analyzer (${m.companyName})`,
        text: [
          `Hello ${m.name},`,
          '',
          `You have been invited to the PAM Analyzer of ${m.companyName}.`,
          '',
          `1. Choose your password: ${m.link}`,
          `2. Connect the app: in the app, "Connect to the server", scan the QR code from the link or enter the code ${m.code}.`,
          '',
          `The invitation is valid until ${until} and can be used once.`,
        ].join('\n'),
      };
}

/** Sends the invitation; throws when the mail server refuses it. */
export async function sendInvite(smtp: SmtpConfig, mail: InviteMail): Promise<void> {
  const { subject, text } = inviteText(mail);
  await transportFor(smtp).sendMail({ from: smtp.from, to: mail.to, subject, text });
}
