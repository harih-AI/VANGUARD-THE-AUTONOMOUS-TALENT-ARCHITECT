import type { Candidate } from '../types/index.js';
import path from 'path';
import { AIService } from '../utils/ai.js';
import logger from '../utils/logger.js';

export class InformationExtractor {
    static async extract(text: string, fileName: string): Promise<Candidate> {
        // AI ONLY (No Fallback)
        const prompt = `
            Extract candidate information from the following resume text.
            Return ONLY a JSON object with these keys: 
            "name", "email", "phone", "skills" (array), "education", "experience".
            
            Resume Text:
            ${text.substring(0, 4000)}
            
            Return ONLY a JSON object:
            {
              "name": "string",
              "email": "string",
              "phone": "string",
              "skills": ["string"],
              "education": "string",
              "experience": "string"
            }
        `;

        try {
            const response = await AIService.callLLM(prompt, 'You are an Expert HR Scout specialized in parsing resumes and extracting structured entity data.');
            const result = AIService.parseJSON(response);

            if (result && result.name) {
                logger.info(`AI Resume extraction successful for: ${result.name}`);
                return {
                    fileName,
                    name: result.name || 'N/A',
                    email: result.email || 'N/A',
                    phone: result.phone || 'N/A',
                    skills: Array.isArray(result.skills) ? result.skills : ['N/A'],
                    education: result.education || 'N/A',
                    experience: result.experience || 'N/A'
                };
            }
            throw new Error('Invalid AI response format');
        } catch (error: any) {
            logger.error(`AI extraction failed: ${error.message}`);
            return {
                fileName,
                name: 'Unknown Candidate',
                email: 'N/A',
                phone: 'N/A',
                skills: ['N/A'],
                education: 'N/A',
                experience: `[AI ERROR]: Failed to parse resume. Reason: ${error.message}`
            };
        }
    }
}
