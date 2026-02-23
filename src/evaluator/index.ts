import { v4 as uuidv4 } from 'uuid';
import { evaluateCodeQuality } from './codeQuality.js';
import { evaluateReadmeClarity } from './readmeClarity.js';
import { evaluateProjectStructure } from './projectStructure.js';
import { evaluateInnovation } from './innovation.js';
import { evaluateTechnical } from './technical.js';
import { evaluateAlignment } from './alignmentCheck.js';
import { GitHubService } from '../github/githubService.js';
import { getDatabase } from '../database/index.js';
import { config } from '../config/index.js';
import type { EvaluationReport, EvaluationFeedback } from '../types/index.js';
import logger from '../utils/logger.js';
import { AIService } from '../utils/ai.js';

/**
 * Orchestrates the full evaluation pipeline for a GitHub submission.
 */
export class EvaluationEngine {
    /**
     * Runs all evaluation agents on a submission and stores the result.
     */
    static async evaluate(submissionId: string, githubUrl: string, hackathonId: string, candidateEmail: string): Promise<EvaluationReport> {
        logger.info(`Starting evaluation for submission ${submissionId}: ${githubUrl}`);

        // 1. Clone the repository
        const repoPath = await GitHubService.cloneRepo(githubUrl, config.reposDir);

        // 2. Get file structure
        const files = await GitHubService.getRepoStructure(repoPath);
        logger.info(`Found ${files.length} files in repository`);

        // 3. Get GitHub metadata (optional)
        const { owner, repo } = GitHubService.validateRepoUrl(githubUrl);
        const repoMeta = (owner && repo) ? await GitHubService.getRepoMetadata(owner, repo) : null;

        // 4. Get hackathon problem statement
        const db = getDatabase();
        const hackathon = db.prepare('SELECT title, description FROM hackathons WHERE id = ?').get(hackathonId) as any;
        const hackathonTitle = hackathon?.title || '';
        const hackathonDesc = hackathon?.description || '';

        // 5. Run all evaluators in parallel (including alignment check)
        const [codeQuality, readmeClarity, projectStructure, innovation, technical, alignment] = await Promise.all([
            evaluateCodeQuality(repoPath, files),
            evaluateReadmeClarity(repoPath, files),
            evaluateProjectStructure(files),
            evaluateInnovation(repoPath, files, repoMeta),
            evaluateTechnical(repoPath, files),
            evaluateAlignment(repoPath, files, hackathonTitle, hackathonDesc),
        ]);

        // 6. Calculate overall score (weighted: includes alignment)
        // Alignment severely impacts the score — if project is unrelated, score drops
        const rawScore = Math.round(
            codeQuality.score * 0.20 +
            readmeClarity.score * 0.10 +
            projectStructure.score * 0.10 +
            innovation.score * 0.15 +
            technical.score * 0.20 +
            alignment.score * 0.25
        );

        // Only penalize if alignment is extremely low (truly unrelated project)
        // Don't punish projects that are related but just use different terminology
        const alignmentPenalty = alignment.score < 15 ? 0.6 : 1.0;
        const overallScore = Math.round(rawScore * alignmentPenalty);

        // 6. Generate a comprehensive AI Summary
        const summaryPrompt = `
            Act as a Lead Evaluator. Synthesize the following agent reports into a cohesive, professional 3-sentence summary for the candidate's evaluation report.
            The summary must be specific to this project and reference its technical strengths/weaknesses.
            
            AGENT REPORTS:
            - Code Quality: ${codeQuality.feedback}
            - Documentation: ${readmeClarity.feedback}
            - Structure: ${projectStructure.feedback}
            - Innovation: ${innovation.feedback}
            - Technical Implementation: ${technical.feedback}
            - Problem Alignment: ${alignment.feedback}
            
            OVERALL SCORE: ${overallScore}/100
            
            Return ONLY the text of the summary.
        `;

        let summaryText = `The Agentic Evaluation Suite has completed its analysis. This submission achieved an overall score of ${overallScore}/100.`;
        try {
            const summaryResponse = await AIService.callLLM(summaryPrompt, 'You are a Senior Technical Recruiter summarizing specialized agent reports.');
            if (summaryResponse) summaryText = summaryResponse;
        } catch (error) {
            logger.error(`AI Summary generation failed: ${error}`);
        }

        const feedback: EvaluationFeedback = {
            codeQuality: codeQuality.feedback,
            readmeClarity: readmeClarity.feedback,
            projectStructure: projectStructure.feedback,
            innovation: innovation.feedback,
            technical: technical.feedback,
            summary: summaryText,
        };

        // 7. Generate AI recommendation with alignment awareness
        const { recommendation, confidence, reasoning } = await this.generateRecommendation(
            {
                codeQuality: codeQuality.score, readme: readmeClarity.score,
                structure: projectStructure.score, innovation: innovation.score,
                technical: technical.score, overall: overallScore,
                alignment: alignment.score, isAligned: alignment.aligned
            },
            {
                codeQuality: codeQuality.feedback, readme: readmeClarity.feedback,
                structure: projectStructure.feedback, innovation: innovation.feedback,
                technical: technical.feedback
            },
            alignment.mismatchDetails
        );

        (feedback as any).aiRecommendation = recommendation;
        (feedback as any).confidence = confidence;
        (feedback as any).reasoning = reasoning;
        (feedback as any).alignment = alignment.feedback;
        (feedback as any).alignmentScore = alignment.score;
        (feedback as any).isAligned = alignment.aligned;
        (feedback as any).mismatchAlert = alignment.mismatchDetails;

        const report: EvaluationReport = {
            id: uuidv4(),
            submissionId,
            hackathonId,
            candidateEmail,
            codeQualityScore: codeQuality.score,
            readmeClarityScore: readmeClarity.score,
            projectStructureScore: projectStructure.score,
            innovationScore: innovation.score,
            technicalScore: technical.score,
            overallScore,
            feedback,
            evaluatedAt: new Date().toISOString(),
        };

        // 8. Store in database
        db.prepare(`
      INSERT INTO evaluations (id, submission_id, hackathon_id, candidate_email, 
        code_quality_score, readme_clarity_score, project_structure_score,
        innovation_score, technical_score, overall_score, feedback_json,
        ai_recommendation, confidence_level, evaluated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            report.id, submissionId, hackathonId, candidateEmail,
            report.codeQualityScore, report.readmeClarityScore, report.projectStructureScore,
            report.innovationScore, report.technicalScore, report.overallScore,
            JSON.stringify(feedback), recommendation, confidence, report.evaluatedAt
        );

        // 9. Update submission status
        db.prepare(`UPDATE submissions SET status = 'evaluated', evaluation_id = ? WHERE id = ?`)
            .run(report.id, submissionId);

        logger.info(`Evaluation complete for ${candidateEmail}: ${overallScore}/100 (alignment: ${alignment.score}/100, aligned: ${alignment.aligned})`);
        return report;
    }

    /**
     * Recalculates rankings for all evaluations in a hackathon.
     */
    static updateRankings(hackathonId: string): void {
        const db = getDatabase();
        const evaluations = db.prepare(`
      SELECT id, overall_score FROM evaluations 
      WHERE hackathon_id = ? 
      ORDER BY overall_score DESC
    `).all(hackathonId) as Array<{ id: string; overall_score: number }>;

        for (let i = 0; i < evaluations.length; i++) {
            const eval_ = evaluations[i];
            if (eval_) {
                db.prepare(`UPDATE evaluations SET rank = ? WHERE id = ?`).run(i + 1, eval_.id);
            }
        }

        logger.info(`Rankings updated for hackathon ${hackathonId}: ${evaluations.length} entries`);
    }

    /**
     * Re-generates AI recommendations for existing evaluations that have 'pending' recommendation.
     */
    static async regenerateRecommendations(hackathonId: string): Promise<number> {
        const db = getDatabase();
        const evals = db.prepare(`
      SELECT e.*, h.title as hackathon_title, h.description as hackathon_description
      FROM evaluations e
      JOIN hackathons h ON e.hackathon_id = h.id
      WHERE e.hackathon_id = ? AND (e.ai_recommendation = 'pending' OR e.ai_recommendation IS NULL)
    `).all(hackathonId) as any[];

        let updated = 0;
        for (const ev of evals) {
            let feedback: any = {};
            try { feedback = JSON.parse(ev.feedback_json || '{}'); } catch { /* skip */ }

            const { recommendation, confidence, reasoning } = await this.generateRecommendation(
                {
                    codeQuality: ev.code_quality_score, readme: ev.readme_clarity_score,
                    structure: ev.project_structure_score, innovation: ev.innovation_score,
                    technical: ev.technical_score, overall: ev.overall_score,
                    alignment: feedback.alignmentScore ?? 50, isAligned: feedback.isAligned ?? true
                },
                {
                    codeQuality: feedback.codeQuality || '', readme: feedback.readmeClarity || '',
                    structure: feedback.projectStructure || '', innovation: feedback.innovation || '',
                    technical: feedback.technical || ''
                },
                feedback.mismatchAlert || ''
            );

            // Update feedback JSON
            feedback.aiRecommendation = recommendation;
            feedback.confidence = confidence;
            feedback.reasoning = reasoning;

            db.prepare(`
        UPDATE evaluations 
        SET ai_recommendation = ?, confidence_level = ?, feedback_json = ?
        WHERE id = ?
      `).run(recommendation, confidence, JSON.stringify(feedback), ev.id);

            updated++;
            logger.info(`Regenerated recommendation for ${ev.candidate_email}: ${recommendation} (${confidence}% confidence)`);
        }
        return updated;
    }

    /**
     * Generates an AI recommendation with confidence level and detailed reasoning for HR.
     */
    private static async generateRecommendation(
        scores: {
            codeQuality: number; readme: number; structure: number;
            innovation: number; technical: number; overall: number;
            alignment?: number; isAligned?: boolean;
        },
        feedback: {
            codeQuality: string; readme: string; structure: string;
            innovation: string; technical: string;
        },
        mismatchAlert: string = ''
    ): Promise<{ recommendation: string; confidence: number; reasoning: string }> {

        // AI ONLY (No Fallback)
        const prompt = `
            Act as a Senior HR Architect and Technical Recruiter. Based on the following hackathon submission metrics,
            provide a final hiring recommendation.
            
            METRICS:
            - Overall Score: ${scores.overall}/100
            - Code Quality: ${scores.codeQuality}/100
            - README Clarity: ${scores.readme}/100
            - Project Structure: ${scores.structure}/100
            - Innovation Level: ${scores.innovation}/100
            - Technical Implementation: ${scores.technical}/100
            - Problem Alignment: ${scores.alignment}/100 (Is Aligned: ${scores.isAligned})
            
            FEEDBACK FROM AGENTS:
            - Code Quality Specialist: ${feedback.codeQuality}
            - Documentation Expert: ${feedback.readme}
            - Systems Architect: ${feedback.structure}
            - Innovation Scout: ${feedback.innovation}
            - Technical Lead: ${feedback.technical}
            ${mismatchAlert ? '- AUDITOR ALERT: ' + mismatchAlert : ''}
            
            Provide a structured recommendation. 
            RECOMMENDATION values must be exactly one of: "STRONGLY_RECOMMEND", "RECOMMEND", "NEEDS_REVIEW", "NOT_RECOMMENDED".
            CONFIDENCE must be a number from 0-100.
            REASONING must be a professional, detailed explanation for HR personnel.
            
            Return ONLY a JSON object:
            {
              "recommendation": "string",
              "confidence": number,
              "reasoning": "string"
            }
        `;

        try {
            const response = await AIService.callLLM(prompt, 'You are the Final Orchestrator and Decision Maker for an AI-powered hiring platform.');
            const result = AIService.parseJSON(response);

            if (result && result.recommendation) {
                return {
                    recommendation: result.recommendation,
                    confidence: result.confidence || 70,
                    reasoning: result.reasoning || 'Recommendation generated by AI Decision Agent.'
                };
            }
            throw new Error('Invalid AI response format');
        } catch (error: any) {
            logger.error(`AI recommendation failed: ${error.message}`);
            return {
                recommendation: 'NEEDS_REVIEW',
                confidence: 0,
                reasoning: `[AI ERROR]: Final recommendation failed. Reason: ${error.message}`
            };
        }
    }
}
