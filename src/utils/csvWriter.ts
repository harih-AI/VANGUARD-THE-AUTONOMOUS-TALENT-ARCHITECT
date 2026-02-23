import { createObjectCsvWriter } from 'csv-writer';
import type { Candidate } from '../types/index.js';
import logger from './logger.js';

export class CsvWriter {
    static async write(candidates: Candidate[], outputPath: string): Promise<void> {
        const csvWriter = createObjectCsvWriter({
            path: outputPath,
            header: [
                { id: 'fileName', title: 'File Name' },
                { id: 'name', title: 'Candidate Name' },
                { id: 'email', title: 'Email' },
                { id: 'phone', title: 'Phone Number' },
                { id: 'skills', title: 'Skills' },
                { id: 'education', title: 'Education' },
                { id: 'experience', title: 'Experience' },
            ]
        });

        const records = candidates.map(c => ({
            ...c,
            skills: Array.isArray(c.skills) ? c.skills.join(', ') : c.skills
        }));

        try {
            await csvWriter.writeRecords(records);
            logger.info(`Successfully wrote ${candidates.length} records to ${outputPath}`);
        } catch (error: any) {
            logger.error(`Error writing CSV: ${error.message}`);
            throw error;
        }
    }
}
