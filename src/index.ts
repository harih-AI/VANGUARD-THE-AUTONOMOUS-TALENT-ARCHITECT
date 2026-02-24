import fs from 'fs-extra';
import path from 'path';
import { FileParser } from './parser/fileParser.js';
import { InformationExtractor } from './extractor/informationExtractor.js';
import { CsvWriter } from './utils/csvWriter.js';
import type { Candidate } from './types/index.js';
import logger from './utils/logger.js';
import chalk from 'chalk';

async function main() {
    console.log('Starting application...');
    const resumesDir = path.resolve('./resumes');
    const outputFile = 'extracted_candidates.csv';

    try {
        // 1. Ensure directory exists
        if (!await fs.pathExists(resumesDir)) {
            logger.error(`Resumes directory not found: ${resumesDir}`);
            console.log(chalk.red(`Error: Please create a './resumes' folder and add files.`));
            return;
        }

        // 2. Recursive file finding
        async function getFiles(dir: string): Promise<string[]> {
            const dirents = await fs.readdir(dir, { withFileTypes: true });
            const files = await Promise.all(dirents.map((dirent) => {
                const res = path.resolve(dir, dirent.name);
                return dirent.isDirectory() ? getFiles(res) : res;
            }));
            return Array.prototype.concat(...files);
        }

        const allFiles = await getFiles(resumesDir);
        const supportedExtensions = ['.pdf', '.docx', '.doc', '.txt'];
        const resumeFiles = allFiles.filter(f => supportedExtensions.includes(path.extname(f).toLowerCase()));

        if (resumeFiles.length === 0) {
            console.log(chalk.yellow('No supported resume files found in ./resumes/ folder.'));
            return;
        }

        console.log(chalk.cyan(`Found ${resumeFiles.length} resume files. Starting extraction...\n`));

        const candidates: Candidate[] = [];
        const processedHashes = new Set<string>(); // For duplicate detection (basic by filename/content)

        // 3. Process each file
        for (let i = 0; i < resumeFiles.length; i++) {
            const filePath = resumeFiles[i];
            if (!filePath) continue;

            const fileName = path.relative(resumesDir, filePath);

            process.stdout.write(chalk.white(`[${i + 1}/${resumeFiles.length}] Processing: ${fileName}... `));

            try {
                const rawText = await FileParser.parseFile(filePath);
                const cleanedText = FileParser.cleanText(rawText);

                // Basic duplicate check by content snippet
                const contentSnippet = cleanedText.substring(0, 200);
                if (processedHashes.has(contentSnippet)) {
                    console.log(chalk.yellow('SKIPPED (Duplicate)'));
                    logger.warn(`Duplicate file content detected: ${fileName}`);
                    continue;
                }
                processedHashes.add(contentSnippet);

                const candidate = await InformationExtractor.extract(cleanedText, fileName);
                candidates.push(candidate);

                console.log(chalk.green('DONE'));
            } catch (error: any) {
                console.log(chalk.red('FAILED'));
                logger.error(`Failed to process ${fileName}: ${error.message}`);
            }
        }

        // 4. Save results
        if (candidates.length > 0) {
            console.log(chalk.cyan(`\nSaving ${candidates.length} candidates to ${outputFile}...`));
            await CsvWriter.write(candidates, outputFile);
            console.log(chalk.greenBright('\nAll operations completed successfully! ✨'));
        } else {
            console.log(chalk.yellow('\nNo candidates were successfully extracted. Check log for details.'));
        }

    } catch (error: any) {
        logger.error(`Critical error in application: ${error.message}`);
        console.error(chalk.red(`A critical error occurred: ${error.message}`));
    }
}

main();
