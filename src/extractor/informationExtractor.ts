import type { Candidate } from '../types/index.js';
import path from 'path';
import { AIService } from '../utils/ai.js';
import logger from '../utils/logger.js';

export class InformationExtractor {
    static async extract(text: string, fileName: string): Promise<Candidate> {
        logger.info(`Extracting info from ${fileName} (Text length: ${text.length})`);

        const prompt = `
            Extract candidate information from the following resume text.
            Return ONLY a JSON object with these keys: 
            "name", "email", "phone", "skills" (array), "education", "experience".
            
            Resume Text:
            ${text.substring(0, 5000)}
            
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

            if (result) {
                // Handle various case permutations or slight key variations
                const name = result.name || result.Name || result.fullName || result.candidateName;
                const email = result.email || result.Email || result.emailAddress;
                const phone = result.phone || result.Phone || result.phoneNumber || result.contact;

                if (name) {
                    logger.info(`AI Resume extraction successful for: ${name}`);
                    return {
                        fileName,
                        name: String(name),
                        email: String(email || 'N/A'),
                        phone: String(phone || 'N/A'),
                        skills: Array.isArray(result.skills) ? result.skills : (result.skills ? [String(result.skills)] : ['N/A']),
                        education: String(result.education || 'N/A'),
                        experience: String(result.experience || 'N/A')
                    };
                }
            }
            logger.warn(`AI extraction returned invalid structure for ${fileName}: ${response.substring(0, 500)}`);
            throw new Error('Candidate name not found in AI response');
        } catch (error: any) {
            logger.error(`AI extraction failed for ${fileName}: ${error.message}`);
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
