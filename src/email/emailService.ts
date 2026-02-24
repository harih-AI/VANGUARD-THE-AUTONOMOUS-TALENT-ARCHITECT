import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { EmailPayload, InvitationContext } from '../types/index.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

export class EmailService {
    private resend: Resend | null = null;
    private transporter: nodemailer.Transporter | null = null;
    private brevoKey: string;
    private useResend: boolean;
    private useBrevo: boolean;

    constructor() {
        const resendKey = process.env['RESEND_API_KEY'] || '';
        this.brevoKey = process.env['BREVO_API_KEY'] || '';
        this.useBrevo = !!this.brevoKey;
        this.useResend = !this.useBrevo && !!resendKey;

        if (this.useBrevo) {
            logger.info('Email provider: Brevo API (HTTP) — sends to any recipient!');
        } else if (this.useResend) {
            this.resend = new Resend(resendKey);
            logger.info('Email provider: Resend API (HTTP) — domain verification required for non-owned emails');
        } else {
            this.transporter = nodemailer.createTransport({
                host: config.smtp.host,
                port: config.smtp.port,
                secure: config.smtp.secure,
                auth: {
                    user: config.smtp.user,
                    pass: config.smtp.pass,
                },
            });
            logger.info(`Email provider: SMTP (${config.smtp.host}:${config.smtp.port})`);
        }
    }

    async verifyConnection(): Promise<boolean> {
        if (this.useBrevo || this.useResend) {
            logger.info('HTTP email API is ready.');
            return true;
        }
        try {
            await this.transporter!.verify();
            logger.info('SMTP connection verified successfully');
            return true;
        } catch (error: any) {
            logger.warn(`SMTP connection failed: ${error.message}. Emails will be logged but not sent.`);
            return false;
        }
    }

    private async sendViaBrevo(payload: EmailPayload): Promise<boolean> {
        const senderEmail = config.smtp.from?.replace(/.*<(.+)>.*/, '$1') || config.smtp.user;
        const senderName = config.smtp.from?.match(/^(.+)</) ? config.smtp.from.match(/^(.+)</)?.[1].trim() : 'Vanguard HR';

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': this.brevoKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sender: { name: senderName || 'Vanguard HR', email: senderEmail },
                to: [{ email: payload.to }],
                subject: payload.subject,
                htmlContent: payload.html,
                textContent: payload.text,
            }),
        });

        if (response.ok) {
            logger.info(`Email sent via Brevo to ${payload.to}`);
            return true;
        } else {
            const err = await response.json() as any;
            logger.error(`Brevo failed to send to ${payload.to}: ${err.message || JSON.stringify(err)}`);
            return false;
        }
    }

    async sendEmail(payload: EmailPayload): Promise<boolean> {
        if (this.useBrevo) {
            return this.sendViaBrevo(payload);
        }

        if (this.useResend && this.resend) {
            try {
                const from = config.smtp.from || 'Vanguard HR <onboarding@resend.dev>';
                const { error } = await this.resend.emails.send({
                    from,
                    to: payload.to,
                    subject: payload.subject,
                    html: payload.html,
                    ...(payload.text ? { text: payload.text } : {}),
                });
                if (error) {
                    logger.error(`Resend failed to send to ${payload.to}: ${error.message}`);
                    return false;
                }
                logger.info(`Email sent via Resend to ${payload.to}`);
                return true;
            } catch (error: any) {
                logger.error(`Resend exception for ${payload.to}: ${error.message}`);
                return false;
            }
        }

        // Fallback: SMTP
        try {
            const info = await this.transporter!.sendMail({
                from: config.smtp.from,
                to: payload.to,
                subject: payload.subject,
                html: payload.html,
                text: payload.text,
            });
            logger.info(`Email sent via SMTP to ${payload.to}: ${info.messageId}`);
            return true;
        } catch (error: any) {
            logger.error(`Failed to send email to ${payload.to}: ${error.message}`);
            logger.info(`[EMAIL LOG] To: ${payload.to} | Subject: ${payload.subject}`);
            return false;
        }
    }

    generateInvitationEmail(ctx: InvitationContext): EmailPayload {
        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, sans-serif; max-width: 600px; margin: 0 auto; background: #f4f7fc; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 40px 30px; text-align: center; color: white;">
    <h1 style="margin: 0 0 10px; font-size: 28px;">🚀 You're Invited!</h1>
    <h2 style="margin: 0; font-weight: 400; font-size: 20px;">${ctx.hackathonTitle}</h2>
  </div>
  <div style="background: white; border-radius: 16px; padding: 30px; margin-top: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
    <p style="font-size: 16px; color: #333;">Hi <strong>${ctx.candidateName}</strong>,</p>
    <p style="font-size: 15px; color: #555; line-height: 1.6;">
      We are thrilled to invite you to participate in our upcoming hackathon:
      <strong>${ctx.hackathonTitle}</strong>!
    </p>
    ${ctx.hackathonDescription ? `<p style="font-size: 14px; color: #666; line-height: 1.6; background: #f8f9fa; padding: 15px; border-radius: 8px;">${ctx.hackathonDescription}</p>` : ''}
    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
      <strong>⏰ Deadline:</strong> ${new Date(ctx.deadline).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${ctx.submissionUrl}" 
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block;">
        Submit Your Project →
      </a>
    </div>
    <p style="font-size: 13px; color: #999; text-align: center;">
      Submit your GitHub repository link before the deadline to participate.
    </p>
  </div>
  <p style="text-align: center; font-size: 12px; color: #aaa; margin-top: 20px;">
    This is an automated invitation. Please do not reply to this email.
  </p>
</body>
</html>`;

        return {
            to: '',
            subject: `🚀 Hackathon Invitation: ${ctx.hackathonTitle}`,
            html,
            text: `You're invited to ${ctx.hackathonTitle}! Submit your GitHub repo at ${ctx.submissionUrl} before ${ctx.deadline}.`,
        };
    }

    async sendInvitations(
        emails: Array<{ email: string; name: string }>,
        ctx: InvitationContext,
        onProgress?: (sent: number, total: number, email: string) => void
    ): Promise<{ sent: number; failed: number; total: number; error?: string }> {
        let sent = 0;
        let failed = 0;
        let lastError = '';
        const total = emails.length;

        for (const { email, name } of emails) {
            const personalCtx = { ...ctx, candidateName: name };
            const payload = this.generateInvitationEmail(personalCtx);
            payload.to = email;

            try {
                const success = await this.sendEmail(payload);
                if (success) {
                    sent++;
                } else {
                    failed++;
                    lastError = 'See server logs for details';
                }
            } catch (err: any) {
                failed++;
                lastError = err.message;
            }

            // Rate limiting: max 2 req/sec for Resend, Brevo is more lenient
            if (!this.useBrevo) {
                await new Promise(resolve => setTimeout(resolve, 600));
            }

            if (onProgress) {
                onProgress(sent + failed, total, email);
            }
        }

        logger.info(`Invitation send complete: ${sent} sent, ${failed} failed out of ${total}`);
        return { sent, failed, total, error: lastError };
    }
}
