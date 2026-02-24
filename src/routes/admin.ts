import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/index.js';
import { authMiddleware, generateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { EmailService } from '../email/emailService.js';
import { FileParser } from '../parser/fileParser.js';
import { InformationExtractor } from '../extractor/informationExtractor.js';
import { CsvWriter } from '../utils/csvWriter.js';
import { EvaluationEngine } from '../evaluator/index.js';
import { config } from '../config/index.js';
import type { Candidate } from '../types/index.js';
import logger from '../utils/logger.js';
import fs from 'fs-extra';
import path from 'path';

const router = Router();

// ─── Login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ success: false, error: 'Username and password required' });
            return;
        }

        const db = getDatabase();
        const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as any;

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
            return;
        }

        const token = generateToken({ id: user.id, username: user.username, role: user.role });
        res.cookie('auth_token', token, { httpOnly: true, maxAge: 86400000 });
        res.json({ success: true, data: { token, user: { id: user.id, username: user.username, role: user.role } } });
    } catch (error: any) {
        logger.error(`Login error: ${error.message}`);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/logout', (_req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true, message: 'Logged out' });
});

// ─── Resume File Management ───────────────────────────────────
router.get('/resume-files', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const resumesDir = path.resolve(config.resumesDir);
        await fs.ensureDir(resumesDir);

        async function getFiles(dir: string): Promise<string[]> {
            const dirents = await fs.readdir(dir, { withFileTypes: true });
            const files = await Promise.all(dirents.map((dirent) => {
                const res = path.resolve(dir, dirent.name);
                return dirent.isDirectory() ? getFiles(res) : res;
            }));
            return Array.prototype.concat(...files);
        }

        const allFiles = await getFiles(resumesDir);
        const resumeFiles = allFiles.map(f => path.relative(resumesDir, f));

        res.json({ success: true, data: resumeFiles });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/upload-resume', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { filename, content } = req.body;
        if (!filename || !content) {
            res.status(400).json({ success: false, error: 'Filename and content are required' });
            return;
        }

        const resumesDir = path.resolve(config.resumesDir);
        const filePath = path.join(resumesDir, filename);

        // Ensure subdirectories exist if filename contains a path
        await fs.ensureDir(path.dirname(filePath));

        const buffer = Buffer.from(content, 'base64');
        await fs.writeFile(filePath, buffer);
        logger.info(`File uploaded: ${filename}`);

        res.json({ success: true, message: 'File uploaded successfully' });
    } catch (error: any) {
        logger.error(`Upload error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/resume-file', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const filename = String(req.query['filename'] || '');
        if (!filename) {
            res.status(400).json({ success: false, error: 'Filename is required' });
            return;
        }
        const resumesDir = path.resolve(config.resumesDir);
        const filePath = path.join(resumesDir, filename);

        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            res.json({ success: true, message: 'File deleted' });
        } else {
            res.status(404).json({ success: false, error: 'File not found' });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Resume Scanning ──────────────────────────────────────────
router.post('/scan-resumes', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const resumesDir = path.resolve(config.resumesDir);
        if (!await fs.pathExists(resumesDir)) {
            res.status(404).json({ success: false, error: 'Resumes directory not found' });
            return;
        }

        // Recursive file finding
        async function getFiles(dir: string): Promise<string[]> {
            const dirents = await fs.readdir(dir, { withFileTypes: true });
            const files = await Promise.all(dirents.map((dirent) => {
                const res = path.resolve(dir, dirent.name);
                return dirent.isDirectory() ? getFiles(res) : res;
            }));
            return Array.prototype.concat(...files);
        }

        const allFiles = await getFiles(resumesDir);
        logger.info(`Scan Resumes triggered. Found ${allFiles.length} files total.`);
        const supportedExtensions = ['.pdf', '.docx', '.doc', '.txt'];
        const resumeFiles = allFiles.filter(f => supportedExtensions.includes(path.extname(f).toLowerCase()));

        if (resumeFiles.length === 0) {
            res.status(404).json({ success: false, error: 'No supported resume files found' });
            return;
        }

        const candidates: Candidate[] = [];
        const processedHashes = new Set<string>();
        const errors: string[] = [];
        const db = getDatabase();

        for (const filePath of resumeFiles) {
            const fileName = path.relative(resumesDir, filePath);
            try {
                const rawText = await FileParser.parseFile(filePath);
                const cleanedText = FileParser.cleanText(rawText);

                const contentSnippet = cleanedText.substring(0, 200);
                if (processedHashes.has(contentSnippet)) {
                    logger.warn(`Duplicate content detected: ${fileName}`);
                    continue;
                }
                processedHashes.add(contentSnippet);

                const candidate = await InformationExtractor.extract(cleanedText, fileName);
                logger.info(`Extracted candidate for ${fileName}: ${candidate.name} (${candidate.email})`);
                candidates.push(candidate);

                // Store in database
                db.prepare(`
          INSERT OR REPLACE INTO candidates (file_name, name, email, phone, skills, education, experience)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(fileName, candidate.name, candidate.email, candidate.phone,
                    candidate.skills.join(', '), candidate.education, candidate.experience);

            } catch (error: any) {
                errors.push(`${fileName}: ${error.message}`);
                logger.error(`Failed to process ${fileName}: ${error.message}`);
            }
        }

        // Write CSV
        if (candidates.length > 0) {
            await CsvWriter.write(candidates, config.csvOutput);
        }

        res.json({
            success: true,
            data: {
                totalFiles: resumeFiles.length,
                processed: candidates.length,
                duplicatesSkipped: resumeFiles.length - candidates.length - errors.length,
                errors: errors.length,
                errorDetails: errors,
                candidates: candidates.map(c => ({ name: c.name, email: c.email, phone: c.phone, experience: c.experience })),
            },
        });
    } catch (error: any) {
        logger.error(`Scan error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Hackathon Management ─────────────────────────────────────
router.post('/hackathons', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { title, description, deadline } = req.body;
        if (!title || !deadline) {
            res.status(400).json({ success: false, error: 'Title and deadline are required' });
            return;
        }

        const id = uuidv4();
        const db = getDatabase();
        db.prepare(`
      INSERT INTO hackathons (id, title, description, deadline, created_by) VALUES (?, ?, ?, ?, ?)
    `).run(id, title, description || '', deadline, req.user?.id || 'system');

        logger.info(`Hackathon created: ${title} (${id})`);
        res.json({ success: true, data: { id, title, description, deadline, status: 'active' } });
    } catch (error: any) {
        logger.error(`Hackathon creation error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/hackathons', authMiddleware, async (_req, res) => {
    try {
        const db = getDatabase();
        const hackathons = db.prepare('SELECT * FROM hackathons ORDER BY created_at DESC').all();
        res.json({ success: true, data: hackathons });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/hackathons/:id', authMiddleware, async (req, res) => {
    try {
        const db = getDatabase();
        const hackathon = db.prepare('SELECT * FROM hackathons WHERE id = ?').get(String(req.params['id']));
        if (!hackathon) { res.status(404).json({ success: false, error: 'Hackathon not found' }); return; }
        res.json({ success: true, data: hackathon });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Send Invitations ─────────────────────────────────────────
router.post('/hackathons/:id/send-invitations', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const hackathonId = String(req.params['id']);
        const db = getDatabase();
        const hackathon = db.prepare('SELECT * FROM hackathons WHERE id = ?').get(hackathonId) as any;
        if (!hackathon) { res.status(404).json({ success: false, error: 'Hackathon not found' }); return; }

        // Get all candidates
        const candidates = db.prepare('SELECT DISTINCT email, name FROM candidates WHERE email != ?').all('N/A') as Array<{ email: string; name: string }>;
        if (candidates.length === 0) {
            res.status(404).json({ success: false, error: 'No candidates found. Scan resumes first.' });
            return;
        }

        const emailService = new EmailService();
        const submissionUrl = `${config.appUrl}/submit?hackathon=${hackathonId}`;

        const result = await emailService.sendInvitations(candidates, {
            hackathonTitle: hackathon.title,
            hackathonDescription: hackathon.description,
            deadline: hackathon.deadline,
            submissionUrl,
            candidateName: '',
        });

        // Record invitations in database
        for (const candidate of candidates) {
            db.prepare(`
        INSERT OR IGNORE INTO invitations (id, hackathon_id, candidate_email, candidate_name, sent_at, status)
        VALUES (?, ?, ?, ?, datetime('now'), 'sent')
      `).run(uuidv4(), hackathonId, candidate.email, candidate.name);
        }

        res.json({ success: true, data: result });
    } catch (error: any) {
        logger.error(`Invitation error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Submissions & Evaluations ────────────────────────────────
router.get('/hackathons/:id/submissions', authMiddleware, async (req, res) => {
    try {
        const db = getDatabase();
        const submissions = db.prepare(`
      SELECT s.*, e.overall_score, e.rank 
      FROM submissions s 
      LEFT JOIN evaluations e ON s.evaluation_id = e.id
      WHERE s.hackathon_id = ?
      ORDER BY e.overall_score DESC NULLS LAST
    `).all(String(req.params['id']));
        res.json({ success: true, data: submissions });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/hackathons/:id/evaluate-all', authMiddleware, async (req, res) => {
    try {
        const hackathonId = String(req.params['id'] || '');
        const db = getDatabase();
        const submissions = db.prepare(`
      SELECT * FROM submissions WHERE hackathon_id = ? AND status = 'pending'
    `).all(hackathonId) as Array<{ id: string; github_repo_url: string; candidate_email: string }>;

        if (submissions.length === 0) {
            res.json({ success: true, message: 'No pending submissions to evaluate' });
            return;
        }

        const results = [];
        for (const sub of submissions) {
            try {
                db.prepare(`UPDATE submissions SET status = 'evaluating' WHERE id = ?`).run(sub.id);
                const report = await EvaluationEngine.evaluate(sub.id, sub.github_repo_url, hackathonId, sub.candidate_email);
                results.push({ email: sub.candidate_email, score: report.overallScore, status: 'evaluated' });
            } catch (error: any) {
                db.prepare(`UPDATE submissions SET status = 'error' WHERE id = ?`).run(sub.id);
                results.push({ email: sub.candidate_email, status: 'error', error: error.message });
                logger.error(`Evaluation failed for ${sub.candidate_email}: ${error.message}`);
            }
        }

        EvaluationEngine.updateRankings(hackathonId);
        res.json({ success: true, data: { evaluated: results.filter(r => r.status === 'evaluated').length, errors: results.filter(r => r.status === 'error').length, results } });
    } catch (error: any) {
        logger.error(`Evaluation error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Rankings / Leaderboard ───────────────────────────────────
router.get('/hackathons/:id/rankings', authMiddleware, async (req, res) => {
    try {
        const db = getDatabase();
        const rankings = db.prepare(`
      SELECT e.*, s.github_repo_url, s.candidate_name
      FROM evaluations e
      JOIN submissions s ON e.submission_id = s.id
      WHERE e.hackathon_id = ?
      ORDER BY e.overall_score DESC
    `).all(String(req.params['id']));
        res.json({ success: true, data: rankings });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Regenerate Recommendations (for existing evals) ──────────
router.post('/hackathons/:id/regenerate-recommendations', authMiddleware, async (req, res) => {
    try {
        const hackathonId = String(req.params['id']);
        const updated = EvaluationEngine.regenerateRecommendations(hackathonId);
        res.json({ success: true, data: { updated }, message: `Regenerated recommendations for ${updated} evaluations` });
    } catch (error: any) {
        logger.error(`Regenerate error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Re-evaluate a specific submission (with alignment) ───────
router.post('/evaluations/:id/re-evaluate', authMiddleware, async (req, res) => {
    try {
        const evalId = String(req.params['id']);
        const db = getDatabase();

        // Get the old evaluation to find the submission
        const oldEval = db.prepare(`
      SELECT e.submission_id, s.github_repo_url, e.hackathon_id, e.candidate_email
      FROM evaluations e JOIN submissions s ON e.submission_id = s.id
      WHERE e.id = ?
    `).get(evalId) as any;

        if (!oldEval) {
            res.status(404).json({ success: false, error: 'Evaluation not found' });
            return;
        }

        // Delete old evaluation
        db.prepare('DELETE FROM evaluations WHERE id = ?').run(evalId);
        db.prepare(`UPDATE submissions SET status = 'pending', evaluation_id = NULL WHERE id = ?`).run(oldEval.submission_id);

        // Re-run evaluation with alignment check
        const report = await EvaluationEngine.evaluate(
            oldEval.submission_id, oldEval.github_repo_url,
            oldEval.hackathon_id, oldEval.candidate_email
        );
        EvaluationEngine.updateRankings(oldEval.hackathon_id);

        res.json({ success: true, message: 'Re-evaluation complete', data: { newEvalId: report.id, score: report.overallScore } });
    } catch (error: any) {
        logger.error(`Re-evaluation error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Candidates ───────────────────────────────────────────────
router.get('/candidates', authMiddleware, async (_req, res) => {
    try {
        const db = getDatabase();
        const candidates = db.prepare('SELECT * FROM candidates ORDER BY extracted_at DESC').all();
        res.json({ success: true, data: candidates });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Evaluation Detail (for HR review) ────────────────────────
router.get('/evaluations/:id', authMiddleware, async (req, res) => {
    try {
        const db = getDatabase();
        const evaluation = db.prepare(`
      SELECT e.*, s.github_repo_url, s.candidate_name, s.candidate_email, s.submitted_at
      FROM evaluations e
      JOIN submissions s ON e.submission_id = s.id
      WHERE e.id = ?
    `).get(String(req.params['id'])) as any;

        if (!evaluation) {
            res.status(404).json({ success: false, error: 'Evaluation not found' });
            return;
        }

        // Parse feedback JSON
        try {
            evaluation.feedback = JSON.parse(evaluation.feedback_json || '{}');
        } catch { evaluation.feedback = {}; }

        res.json({ success: true, data: evaluation });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Approve / Reject Candidate ───────────────────────────────
router.post('/evaluations/:id/approve', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const evalId = String(req.params['id']);
        const { action, notes } = req.body;

        if (!action || !['approved', 'rejected'].includes(action)) {
            res.status(400).json({ success: false, error: 'Action must be "approved" or "rejected"' });
            return;
        }

        const db = getDatabase();
        const evaluation = db.prepare('SELECT id FROM evaluations WHERE id = ?').get(evalId);
        if (!evaluation) {
            res.status(404).json({ success: false, error: 'Evaluation not found' });
            return;
        }

        db.prepare(`
      UPDATE evaluations 
      SET approval_status = ?, hr_notes = ?, approved_by = ?, approved_at = datetime('now')
      WHERE id = ?
    `).run(action, notes || '', req.user?.username || 'admin', evalId);

        logger.info(`Evaluation ${evalId} ${action} by ${req.user?.username}`);
        res.json({ success: true, message: `Candidate ${action} successfully`, data: { id: evalId, approval_status: action } });
    } catch (error: any) {
        logger.error(`Approval error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
