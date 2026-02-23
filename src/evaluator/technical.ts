import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import { AIService } from '../utils/ai.js';

/**
 * Evaluates technical implementation depth.
 */
export async function evaluateTechnical(repoPath: string, files: string[]): Promise<{ score: number; feedback: string }> {
    const codeFiles = files.filter(f => /\.(ts|js|py|java|go|rs|rb|c|cpp|cs|php|swift|kt)$/i.test(f));

    if (codeFiles.length === 0) {
        return { score: 10, feedback: 'No recognizable code files found.' };
    }

    // AI ONLY (No Fallback)
    const codeSample = await getCodeSample(repoPath, codeFiles);
    const prompt = `
        Analyze the following code samples from a GitHub repository for a hackathon.
        Evaluate technical implementation depth, architecture, and advanced pattern usage.
        Rate the technical implementation on a scale of 0-100 and provide descriptive, professional feedback.
        
        CRITICAL INSTRUCTIONS:
        1. Cite specific file names and code blocks.
        2. Identify EXACTLY which advanced technologies or patterns are being used (e.g. mention the specific DB library, specific async patterns, or specific algorithm implementations found).
        3. If the project lacks technical depth, explain exactly what is missing or where it is over-simplified.
        
        Code Samples:
        ${codeSample}
        
        Return ONLY a JSON object:
        {
          "score": number,
          "feedback": "string"
        }
    `;

    try {
        const response = await AIService.callLLM(prompt, 'You are a Principal Software Engineer evaluating the technical implementation and architectural depth of hackathon projects.');
        const result = AIService.parseJSON(response);

        if (result && typeof result.score === 'number') {
            logger.info(`AI Technical evaluation: ${result.score}/100`);
            return result;
        }
        throw new Error('Invalid AI response format');
    } catch (error: any) {
        logger.error(`AI Technical evaluation failed: ${error.message}`);
        return {
            score: 0,
            feedback: `[AI ERROR]: Failed to analyze technical implementations. Reason: ${error.message}`
        };
    }
}

async function getCodeSample(repoPath: string, codeFiles: string[]): Promise<string> {
    // Prioritize src/ files and exclude common boilerplate/config
    const meaningfulFiles = codeFiles
        .filter(f => f.includes('src/') || f.includes('lib/') || f.includes('app/'))
        .filter(f => !f.endsWith('.config.js') && !f.endsWith('.config.ts') && !f.endsWith('test.ts') && !f.endsWith('spec.ts'))
        .slice(0, 10);

    // Fallback to regular code files if no src files found
    const finalFiles = meaningfulFiles.length > 0 ? meaningfulFiles : codeFiles.slice(0, 10);

    let sample = '';
    for (const file of finalFiles) {
        try {
            const content = await fs.readFile(path.join(repoPath, file), 'utf-8');
            sample += `\n--- File: ${file} ---\n${content.substring(0, 3000)}\n`;
        } catch { /* skip */ }
    }
    return sample;
}
