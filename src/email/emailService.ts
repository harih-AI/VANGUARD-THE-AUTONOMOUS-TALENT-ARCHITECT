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
            family: 4,
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            auth: {
                user: config.smtp.user,
                pass: config.smtp.pass,
            },
            // Extremely generous timeouts for slow cloud handshakes
            connectionTimeout: 30000,
            greetingTimeout: 20000,
            socketTimeout: 60000,
            tls: {
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2',
                servername: config.smtp.host
            }
        } as any);

        logger.info(`EmailService initialized: ${config.smtp.host}:${config.smtp.port} (secure: ${config.smtp.secure}, IPv4)`);
    }

    async verifyConnection(): Promise<boolean> {
        try {
            // Force verify the Gmail SMTP connection
            logger.info(`Verifying Gmail SMTP connection to ${config.smtp.host}...`);
            await this.transporter.verify();
            return true;
        } catch (error: any) {
            logger.error(`Gmail SMTP Connection Check Failed: ${error.message}`);
            return false;
        }
    }

    async sendEmail(payload: EmailPayload): Promise<boolean> {
        // Strictly use Gmail SMTP as requested
        try {
            logger.info(`Sending email via Gmail SMTP to ${payload.to}...`);
            await this.transporter.sendMail({
                from: config.smtp.user, // Use the actual Gmail user address as sender
                to: payload.to,
                subject: payload.subject,
                html: payload.html,
                text: payload.text,
            });
            return true;
        } catch (error: any) {
            logger.error(`Gmail SMTP delivery failed for ${payload.to}: ${error.message}`);
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

        const result: { sent: number; failed: number; total: number; error?: string } = { sent, failed, total };
        if (failed > 0) result.error = 'SMTP Failed';
        return result;
    }
}
