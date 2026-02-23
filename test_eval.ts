
import { initDatabase, closeDatabase } from './src/database/index.js';
import { EvaluationEngine } from './src/evaluator/index.js';
import logger from './src/utils/logger.js';

async function testEval() {
    await initDatabase();
    console.log('--- STARTING TEST EVALUATION ---');
    try {
        const submissionId = '682b268a-e463-44ed-a7bd-ba8d3ff96919';
        const githubUrl = 'https://github.com/harih-AI/little-farm-insight';
        const hackathonId = '1c45bf68-2576-412a-a4d7-f2de5c01fab3';
        const email = 'hariharanrajes@gmail.com';

        const report = await EvaluationEngine.evaluate(submissionId, githubUrl, hackathonId, email);
        console.log('REPORT GENERATED:');
        console.log('Overall Score:', report.overallScore);
        console.log('Alignment Score:', report.feedback.alignmentScore);
        console.log('Summary:', report.feedback.summary);
        console.log('Alignment Feedback:', (report.feedback as any).alignment);
    } catch (e) {
        console.error('TEST FAILED:', e);
    }
    closeDatabase();
}

testEval();
