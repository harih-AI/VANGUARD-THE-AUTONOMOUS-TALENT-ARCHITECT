import { config } from '../config/index.js';
import logger from './logger.js';

export class AIService {
    static async callLLM(prompt: string, systemPrompt: string = 'You are an expert technical evaluator for a hackathon.'): Promise<string> {
        if (!config.openrouterApiKey) {
            logger.warn('OpenRouter API key missing, falling back to manual evaluation.');
            throw new Error('API_KEY_MISSING');
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.openrouterApiKey}`,
                    'HTTP-Referer': config.appUrl,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.aiModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                const error = await response.text();
                logger.error(`OpenRouter error: ${error}`);
                throw new Error(`OpenRouter API error: ${response.status}`);
            }

            const data = await response.json() as any;
            return data.choices[0]?.message?.content || '';
        } catch (error: any) {
            logger.error(`LLM call failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Helper to parse JSON from LLM response safely
     */
    static parseJSON(text: string): any {
        try {
            // Find JSON block if it exists
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return JSON.parse(text);
        } catch (error) {
            logger.error(`Failed to parse AI JSON: ${text}`);
            return null;
        }
    }
}
