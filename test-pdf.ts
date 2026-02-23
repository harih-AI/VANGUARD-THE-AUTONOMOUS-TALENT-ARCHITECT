import { PDFParse } from 'pdf-parse';
import fs from 'fs-extra';

async function test() {
    try {
        const dataBuffer = await fs.readFile('./resumes/Resume_Template_by_Anubhav (4).pdf');
        const parser = new PDFParse({ data: dataBuffer });
        const data = await parser.getText();
        console.log('Text length:', data.text.length);
        console.log('Snippet:', data.text.substring(0, 500));
    } catch (err) {
        console.error('Error:', err);
    }
}

test();
