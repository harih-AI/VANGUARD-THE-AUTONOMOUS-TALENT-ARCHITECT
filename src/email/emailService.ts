import nodemailer from 'nodemailer';
import type { EmailPayload, InvitationContext } from '../types/index.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

export class EmailService {
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure,
            auth: {
                user: config.smtp.user,
                pass: config.smtp.pass,
            },
            connectionTimeout: 5000, // 5 seconds is enough to know it failed on Railway
        });
    }

    async verifyConnection(): Promise<boolean> {
        try {
            await this.transporter.verify();
            return true;
        } catch (error: any) {
            logger.warn(`SMTP connection failed: ${error.message}. Use manual fallback.`);
            return false;
        }
    }

    async sendEmail(payload: EmailPayload): Promise<boolean> {
        try {
            await this.transporter.sendMail({
                from: config.smtp.from,
                to: payload.to,
                subject: payload.subject,
                html: payload.html,
                text: payload.text,
            });
            return true;
        } catch (error: any) {
            logger.error(`Failed to send email to ${payload.to}: ${error.message}`);
            return false;
        }
    }

    generateInvitationEmail(ctx: InvitationContext): EmailPayload {
        const html = `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:20px; border:1px solid #eee; border-radius:10px;">
            <h2 style="color:#667eea;">🚀 Hackathon Invitation</h2>
            <p>Hi <b>${ctx.candidateName}</b>,</p>
            <p>You are invited to participate in <b>${ctx.hackathonTitle}</b>.</p>
            <p>Click the button below to submit your project repository:</p>
            <a href="${ctx.submissionUrl}" style="background:#667eea; color:white; padding:12px 25px; border-radius:5px; text-decoration:none; display:inline-block; font-weight:bold;">Submit Project →</a>
            <p style="color:#888; font-size:12px; margin-top:30px;">Link: ${ctx.submissionUrl}</p>
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
        const total = emails.length;

        for (const { email, name } of emails) {
            const personalCtx = { ...ctx, candidateName: name };
            const payload = this.generateInvitationEmail(personalCtx);
            payload.to = email;

            const success = await this.sendEmail(payload);
            if (success) sent++;
            else failed++;

            if (onProgress) onProgress(sent + failed, total, email);
        }

        return { sent, failed, total, error: failed > 0 ? 'SMTP Failed' : undefined };
    }
}
