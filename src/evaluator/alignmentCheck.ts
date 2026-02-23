import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import { AIService } from '../utils/ai.js';

/**
 * Evaluates how well a submitted project aligns with the hackathon's problem statement.
 */
export async function evaluateAlignment(
    repoPath: string,
    files: string[],
    hackathonTitle: string,
    hackathonDescription: string
): Promise<{ score: number; aligned: boolean; feedback: string; mismatchDetails: string }> {

    const readmeFile = files.find(f => /readme/i.test(f));
    let readme = '';
    if (readmeFile) {
        try { readme = await fs.readFile(path.join(repoPath, readmeFile), 'utf-8'); } catch { /* skip */ }
    }

    const prompt = `
        Evaluate if the following GitHub project accurately aligns with the hackathon problem statement. 
        
        HACKATHON REQUIREMENT:
        Title: ${hackathonTitle}
        Description: ${hackathonDescription}
        
        CANDIDATE SUBMISSION DATA:
        Project README:
        ${readme.substring(0, 5000)}
        
        File List:
        ${files.slice(0, 100).join(', ')}
        
        STRICT EVALUATION RULES:
        1. YOU MUST DETECT REPURPOSED BOILERPLATE. If the README is a generic template (e.g., "Welcome to your Lovable project", "Vite + React template", "Create React App") and has NO section describing how it solves the SPECIFIC hackathon problem, it is NOT aligned.
        2. DO NOT GIVE "BENEFIT OF THE DOUBT". If the code files do not contain logic related to ${hackathonTitle}, the score MUST be below 20.
        3. If the project is just UI scaffolding without the core engine requested, rate it as "partially aligned" but give it a low score (<40).
        4. CITE EVIDENCE: Name the specific files or README lines that prove this is a custom solution for this challenge.
        
        Return ONLY a JSON object:
        {
          "score": number, // 0-100
          "aligned": boolean,
          "feedback": "string",
          "mismatchDetails": "string"
        }
    `;

    try {
        const response = await AIService.callLLM(prompt, 'You are an Auditor checking hackathon submissions for relevance and alignment with problem statements.');
        const result = AIService.parseJSON(response);

        if (result && typeof result.score === 'number') {
            logger.info(`AI Alignment evaluation: ${result.score}/100, aligned: ${result.aligned}`);
            return result;
        }
        throw new Error('Invalid AI response format');
    } catch (error: any) {
        logger.error(`AI Alignment evaluation failed: ${error.message}`);
        return {
            score: 0,
            aligned: false,
            feedback: `[AI ERROR]: Failed to analyze alignment. Reason: ${error.message}`,
            mismatchDetails: `Critical error in AI alignment check: ${error.message}`
        };
    }
}
