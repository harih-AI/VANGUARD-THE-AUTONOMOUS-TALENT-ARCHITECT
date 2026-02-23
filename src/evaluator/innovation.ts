import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import { AIService } from '../utils/ai.js';

/**
 * Evaluates innovation by analyzing unique technologies, patterns, and approaches.
 */
export async function evaluateInnovation(repoPath: string, files: string[], repoMeta?: Record<string, any> | null): Promise<{ score: number; feedback: string }> {
    let readmeText = '';
    const readmeFile = files.find(f => /readme\.md/i.test(f));
    if (readmeFile) {
        try { readmeText = await fs.readFile(path.join(repoPath, readmeFile), 'utf-8'); } catch { /* skip */ }
    }

    const prompt = `
        Analyze the following hackathon submission for innovation, uniqueness, and creative problem solving.
        Look for unique architectures, modern tech stacks, complex feature sets, and "out of the box" thinking.
        
        CRITICAL INSTRUCTIONS:
        1. Identify the EXACT unique features or architectural choices that make this project stand out.
        2. Name specific libraries or custom implementations from the file list below.
        3. If the project is just a standard CRUD app or tutorial duplicate, be critical and explain why.
        
        README.md Content:
        ${readmeText.substring(0, 5000)}
        
        Repository Context:
        - Files: ${files.slice(0, 50).join(', ')}
        - GitHub Stars: ${repoMeta?.['stargazers_count'] || 0}
        - GitHub Topics: ${(repoMeta?.['topics'] || []).join(', ')}
        
        Return ONLY a JSON object:
        {
          "score": number,
          "feedback": "string"
        }
    `;

    try {
        const response = await AIService.callLLM(prompt, 'You are a Technology Scout looking for highly innovative, creative, and "bleeding edge" hackathon projects.');
        const result = AIService.parseJSON(response);

        if (result && typeof result.score === 'number') {
            logger.info(`AI Innovation evaluation: ${result.score}/100`);
            return result;
        }
        throw new Error('Invalid AI response format');
    } catch (error: any) {
        logger.error(`AI Innovation evaluation failed: ${error.message}`);
        return {
            score: 0,
            feedback: `[AI ERROR]: Failed to analyze innovation metrics. Reason: ${error.message}`
        };
    }
}
