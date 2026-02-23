import fs from 'fs-extra';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import logger from '../utils/logger.js';

export class FileParser {
    static async parseFile(filePath: string): Promise<string> {
        const ext = path.extname(filePath).toLowerCase();

        try {
            switch (ext) {
                case '.pdf':
                    return await this.parsePdf(filePath);
                case '.docx':
                    return await this.parseDocx(filePath);
                case '.txt':
                    return await this.parseTxt(filePath);
                default:
                    throw new Error(`Unsupported file extension: ${ext}`);
            }
        } catch (error: any) {
            logger.error(`Error parsing file ${filePath}: ${error.message}`);
            throw error;
        }
    }

    private static async parsePdf(filePath: string): Promise<string> {
        const dataBuffer = await fs.readFile(filePath);
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        return result.text;
    }

    private static async parseDocx(filePath: string): Promise<string> {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    }

    private static async parseTxt(filePath: string): Promise<string> {
        return await fs.readFile(filePath, 'utf8');
    }

    static cleanText(text: string): string {
        return text
            .replace(/\r/g, '')             // Remove carriage returns
            .replace(/[ \t]+/g, ' ')        // Collapse multiple spaces/tabs
            .replace(/\n\s*\n/g, '\n\n')   // Collapse multiple newlines
            .trim();
    }
}
