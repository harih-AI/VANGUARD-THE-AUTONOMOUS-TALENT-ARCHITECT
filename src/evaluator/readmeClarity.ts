import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import { AIService } from '../utils/ai.js';

/**
 * Evaluates README clarity by analyzing structure, content, and presentation.
 */
export async function evaluateReadmeClarity(repoPath: string, files: string[]): Promise<{ score: number; feedback: string }> {
    // Find README file
    const readmeFile = files.find(f => /^readme\.md$/i.test(path.basename(f)));
    if (!readmeFile) {
        return { score: 5, feedback: 'No README.md file found. A good README is essential for project understanding.' };
    }

    let content = '';
    try {
        content = await fs.readFile(path.join(repoPath, readmeFile), 'utf-8');
    } catch {
        return { score: 5, feedback: 'README.md exists but could not be read.' };
    }

    // AI ONLY (No Fallback)
    const prompt = `
        Analyze the following README.md content from a GitHub repository for a hackathon.
        Rate the documentation quality (clarity, structure, installation instructions, examples) on a scale of 0-100 and provide descriptive, professional feedback.
        
        CRITICAL INSTRUCTIONS:
        1. Cite specific sections or headers found in the README.
        2. Identify EXACTLY what is missing or unclear (e.g., mention if the "How to run" section lacks environment variable setup).
        3. Reference specific code blocks within the README if they are used as examples.
        
        README.md Content:
        ${content.substring(0, 5000)}
        
        Return ONLY a JSON object:
        {
          "score": number,
          "feedback": "string"
        }
    `;

    try {
        const response = await AIService.callLLM(prompt, 'You are a Documentation Specialist evaluating technical project READMEs for clarity, completeness, and ease of use.');
        const result = AIService.parseJSON(response);

        if (result && typeof result.score === 'number') {
            logger.info(`AI README clarity evaluation: ${result.score}/100`);
            return result;
        }
        throw new Error('Invalid AI response format');
    } catch (error: any) {
        logger.error(`AI README evaluation failed: ${error.message}`);
        return {
            score: 0,
            feedback: `[AI ERROR]: Failed to analyze README clarity. Reason: ${error.message}`
        };
    }
}
