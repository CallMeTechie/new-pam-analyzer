import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../config.js';

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
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
  });
  const { subject, text } = inviteText(mail);
  await transport.sendMail({ from: smtp.from, to: mail.to, subject, text });
}
