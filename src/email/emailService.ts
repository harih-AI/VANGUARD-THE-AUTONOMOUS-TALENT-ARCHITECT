import { Resend } from 'resend';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import type { EmailPayload, InvitationContext } from '../types/index.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

export class EmailService {
    private resend: Resend | null = null;
    private transporter: nodemailer.Transporter | null = null;
    private useResend: boolean;
    private useSendGrid: boolean;
    private useBrevo: boolean;
    private brevoKey: string;

    constructor() {
        // Provider keys
        const resendKey = process.env['RESEND_API_KEY'] || '';
        const sendgridKey = process.env['SENDGRID_API_KEY'] || '';
        this.brevoKey = process.env['BREVO_API_KEY'] || '';

        // Priority: SendGrid (Simple) > Brevo > Resend > SMTP
        this.useSendGrid = !!sendgridKey;
        this.useBrevo = !this.useSendGrid && !!this.brevoKey;
        this.useResend = !this.useSendGrid && !this.useBrevo && !!resendKey;

        if (this.useSendGrid) {
            sgMail.setApiKey(sendgridKey);
            logger.info('Email provider: SendGrid API (HTTP) - Automatic Mode');
        } else if (this.useBrevo) {
            logger.info('Email provider: Brevo API (HTTP) - Automatic Mode');
        } else if (this.useResend) {
            this.resend = new Resend(resendKey);
            logger.info('Email provider: Resend API (HTTP) - Automatic Mode');
        } else {
            this.transporter = nodemailer.createTransport({
                host: config.smtp.host,
                port: config.smtp.port,
                secure: config.smtp.secure,
                auth: {
                    user: config.smtp.user,
                    pass: config.smtp.pass,
                },
                tls: { rejectUnauthorized: false } // Helps with cloud SMTP blocks sometimes
            });
            logger.info(`Email provider: SMTP (${config.smtp.host}:${config.smtp.port}) - Passive Mode`);
        }
    }

    async verifyConnection(): Promise<boolean> {
        if (this.useSendGrid || this.useBrevo || this.useResend) return true;
        try {
            await this.transporter!.verify();
            return true;
        } catch (error: any) {
            logger.warn(`SMTP check failed: ${error.message}`);
            return false;
        }
    }

    async sendEmail(payload: EmailPayload): Promise<boolean> {
        // 1. SENDGRID (Simple Automatic)
        if (this.useSendGrid) {
            try {
                await sgMail.send({
                    to: payload.to,
                    from: config.smtp.from || 'hackathon@company.com',
                    subject: payload.subject,
                    html: payload.html,
                    text: payload.text || '',
                });
                logger.info(`Email sent via SendGrid to ${payload.to}`);
                return true;
            } catch (error: any) {
                logger.error(`SendGrid failed: ${error.message}`);
                return false;
            }
        }

        // 2. BREVO (API Fallback)
        if (this.useBrevo) {
            try {
                const senderEmail = config.smtp.from?.replace(/.*<(.+)>.*/, '$1') || config.smtp.user;
                const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: { 'api-key': this.brevoKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sender: { name: 'Vanguard HR', email: senderEmail },
                        to: [{ email: payload.to }],
                        subject: payload.subject,
                        htmlContent: payload.html,
                    }),
                });
                return response.ok;
            } catch (error: any) { return false; }
        }

        // 3. RESEND
        if (this.useResend && this.resend) {
            try {
                await this.resend.emails.send({
                    from: config.smtp.from || 'onboarding@resend.dev',
                    to: payload.to,
                    subject: payload.subject,
                    html: payload.html,
                });
                return true;
            } catch (error: any) { return false; }
        }

        // 4. SMTP (Will likely time out on Railway)
        try {
            await this.transporter!.sendMail({
                from: config.smtp.from,
                to: payload.to,
                subject: payload.subject,
                html: payload.html,
            });
            return true;
        } catch (error: any) {
            logger.error(`SMTP Failed: ${error.message}`);
            return false;
        }
    }

    generateInvitationEmail(ctx: InvitationContext): EmailPayload {
        // Ensure the link works! If appUrl is localhost, we should have warned the user,
        // but here we just use what is provided.
        const html = `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:20px; border:1px solid #eee; border-radius:10px;">
            <h2 style="color:#667eea;">🚀 Hackathon Invitation</h2>
            <p>Hi <b>${ctx.candidateName}</b>,</p>
            <p>You are invited to participate in <b>${ctx.hackathonTitle}</b>.</p>
            <div style="background:#f9f9f9; padding:15px; border-radius:8px; margin:20px 0;">
                <p style="margin:0;"><b>Deadline:</b> ${new Date(ctx.deadline).toLocaleString()}</p>
            </div>
            <p>Click the button below to submit your project repository:</p>
            <a href="${ctx.submissionUrl}" style="background:#667eea; color:white; padding:12px 25px; border-radius:5px; text-decoration:none; display:inline-block; font-weight:bold;">Submit Project →</a>
            <p style="color:#888; font-size:12px; margin-top:30px;">If the button doesn't work, copy-paste this link: ${ctx.submissionUrl}</p>
        </div>`;

        return {
            to: '',
            subject: `🚀 Hackathon Invitation: ${ctx.hackathonTitle}`,
            html,
            text: `Invite to ${ctx.hackathonTitle}. Submit at: ${ctx.submissionUrl}`,
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

            const success = await this.sendEmail(payload);
            if (success) sent++;
            else {
                failed++;
                lastError = 'API Error - check provider logs';
            }

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));

            if (onProgress) onProgress(sent + failed, total, email);
        }

        return { sent, failed, total, error: lastError };
    }
}
