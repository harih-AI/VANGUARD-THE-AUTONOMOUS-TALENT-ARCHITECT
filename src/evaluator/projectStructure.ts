import logger from '../utils/logger.js';
import { AIService } from '../utils/ai.js';

/**
 * Evaluates project structure by analyzing directory organization and config files.
 */
export async function evaluateProjectStructure(files: string[]): Promise<{ score: number; feedback: string }> {
    if (files.length === 0) {
        return { score: 5, feedback: 'Repository appears empty.' };
    }

    const prompt = `
        Analyze the following file list from a GitHub directory.
        Evaluate the project organization, directory structure, presence of config files (Docker, CI/CD, linting), and modularity.
        Rate the project structure on a scale of 0-100 and provide descriptive, professional feedback.
        
        CRITICAL INSTRUCTIONS:
        1. Cite specific directory names (e.g., /src, /tests, /config).
        2. Mention specific configuration files found (e.g., Dockerfile, .eslintrc, tsconfig.json).
        3. Identify if the structure follows industry standards for its language/framework.
        
        File List:
        ${files.slice(0, 100).join('\n')}
        
        Return ONLY a JSON object:
        {
          "score": number,
          "feedback": "string"
        }
    `;

    try {
        const response = await AIService.callLLM(prompt, 'You are a Senior DevOps Engineer and Architect evaluating project organization and repository structure.');
        const result = AIService.parseJSON(response);

        if (result && typeof result.score === 'number') {
            logger.info(`AI Project structure evaluation: ${result.score}/100`);
            return result;
        }
        throw new Error('Invalid AI response format');
    } catch (error: any) {
        logger.error(`AI Project structure evaluation failed: ${error.message}`);
        return {
            score: 0,
            feedback: `[AI ERROR]: Failed to analyze project structure. Reason: ${error.message}`
        };
    }
}
