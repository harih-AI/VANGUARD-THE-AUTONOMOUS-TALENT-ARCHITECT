import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/index.js';
import { GitHubService } from '../github/githubService.js';
import { EvaluationEngine } from '../evaluator/index.js';
import logger from '../utils/logger.js';

const router = Router();

// ─── Get hackathon info (public) ──────────────────────────────
router.get('/hackathon/:id', async (req, res) => {
    try {
        const db = getDatabase();
        const hackathon = db.prepare('SELECT id, title, description, deadline, status FROM hackathons WHERE id = ?').get(String(req.params['id'])) as any;

        if (!hackathon) {
            res.status(404).json({ success: false, error: 'Hackathon not found' });
            return;
        }

        res.json({ success: true, data: hackathon });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Submit project ───────────────────────────────────────────
router.post('/submit', async (req, res) => {
    try {
        const { hackathonId, email, name, githubUrl } = req.body;

        // Validate required fields
        if (!hackathonId || !email || !name || !githubUrl) {
            res.status(400).json({ success: false, error: 'All fields are required: hackathonId, email, name, githubUrl' });
            return;
        }

        const db = getDatabase();

        // Check hackathon exists and is active
        const hackathon = db.prepare('SELECT * FROM hackathons WHERE id = ?').get(hackathonId) as any;
        if (!hackathon) {
            res.status(404).json({ success: false, error: 'Hackathon not found' });
            return;
        }
        if (hackathon.status !== 'active') {
            res.status(400).json({ success: false, error: 'This hackathon is no longer accepting submissions' });
            return;
        }

        // Check deadline
        if (new Date(hackathon.deadline) < new Date()) {
            res.status(400).json({ success: false, error: 'Submission deadline has passed' });
            return;
        }

        // Check for duplicate submission
        const existing = db.prepare('SELECT id FROM submissions WHERE hackathon_id = ? AND candidate_email = ?').get(hackathonId, email);
        if (existing) {
            res.status(409).json({ success: false, error: 'You have already submitted for this hackathon' });
            return;
        }

        // Validate GitHub URL
        const validation = GitHubService.validateRepoUrl(githubUrl);
        if (!validation.valid) {
            res.status(400).json({ success: false, error: validation.error });
            return;
        }

        // Check repo accessibility
        const accessible = await GitHubService.checkRepoAccessibility(githubUrl);
        if (!accessible) {
            res.status(400).json({ success: false, error: 'GitHub repository is not accessible. Make sure it is public.' });
            return;
        }

        // Create submission
        const id = uuidv4();
        db.prepare(`
      INSERT INTO submissions (id, hackathon_id, candidate_email, candidate_name, github_repo_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, hackathonId, email, name, githubUrl);

        logger.info(`New submission: ${email} -> ${githubUrl} for hackathon ${hackathonId}`);

        // Trigger async evaluation (fire and forget)
        EvaluationEngine.evaluate(id, githubUrl, hackathonId, email)
            .then(report => {
                EvaluationEngine.updateRankings(hackathonId);
                logger.info(`Auto-evaluation completed for ${email}: ${report.overallScore}/100`);
            })
            .catch(err => {
                logger.error(`Auto-evaluation failed for ${email}: ${err.message}`);
                db.prepare(`UPDATE submissions SET status = 'error' WHERE id = ?`).run(id);
            });

        res.json({
            success: true,
            message: 'Submission received! Your project will be evaluated automatically.',
            data: { submissionId: id },
        });
    } catch (error: any) {
        logger.error(`Submission error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Check submission status ──────────────────────────────────
router.get('/status/:submissionId', async (req, res) => {
    try {
        const db = getDatabase();
        const submission = db.prepare(`
      SELECT s.*, e.overall_score, e.rank, e.feedback_json,
             e.code_quality_score, e.readme_clarity_score, e.project_structure_score,
             e.innovation_score, e.technical_score
      FROM submissions s
      LEFT JOIN evaluations e ON s.evaluation_id = e.id
      WHERE s.id = ?
    `).get(String(req.params['submissionId'])) as any;

        if (!submission) {
            res.status(404).json({ success: false, error: 'Submission not found' });
            return;
        }

        res.json({ success: true, data: submission });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
