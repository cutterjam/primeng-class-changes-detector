const fs = require('fs');
const path = require('path');
const { hideBin } = require('yargs/helpers');
const yargs = require('yargs/yargs');
const OpenAI = require('openai');
require('dotenv').config(); // Load environment variables from .env file

// Initialize OpenAI API
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Load API key from environment variable
});

// Configuration
const argv = yargs(hideBin(process.argv))
    .option('output-dir', {
        alias: 'o',
        type: 'string',
        description: 'Output directory for logs',
        default: '/Users/cutternaismith/Documents/GitHub/primeng-class-changes-detector/class-changes-results'
    })
    .option('class-names', {
        alias: 'c',
        type: 'array',
        description: 'List of class names to search for',
        default: [
            'p-menubar-button'
        ]
    })
    .option('use-ai', {
        alias: 'a',
        type: 'boolean',
        description: 'Use AI to analyze complex changes',
        default: false
    })
    .option('log-file', {
        alias: 'l',
        type: 'string',
        description: 'Path to the pre-generated log file',
        required: true // Make this argument mandatory
    })
    .argv;

const OUTPUT_DIR = argv.outputDir;
const classNames = argv.classNames;
const USE_AI = argv.useAi;
const LOG_FILE = argv.logFile;

function escapeRegex(str) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
}

async function analyzeDiffWithAI(diff) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Use the cheapest model
            messages: [
                { role: "system", content: "Analyze the following code diff and identify any changes to class names, especially in ngClass expressions." },
                { role: "user", content: diff }
            ]
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error calling OpenAI API:', error.message);
        return 'Failed to analyze changes with AI.';
    }
}

function parseNgClassChanges(line) {
    const ngClassRegex = /\[ngClass\]\s*=\s*["'{]([^"'}]+)["'}]/;
    const match = line.match(ngClassRegex);
    if (match) {
        const classes = match[1].split(/\s+/).filter(Boolean);
        return classes;
    }
    return [];
}

async function processLogFile(logFilePath, className) {
    return new Promise((resolve, reject) => {
        try {
            // Read the log file
            const logContent = fs.readFileSync(logFilePath, 'utf-8');

            let output = `PrimeNG Changes for ${className} (v17-v19)\n`;
            output += '============================\n\n';

            // Process the log content
            const commits = logContent.split('Commit: ').filter(Boolean);

            let aiCallCount = 0; // Track the number of API calls
            const maxAICalls = 5; // Limit the number of API calls per class

            for (const commit of commits) {
                const lines = commit.split('\n').filter(line => line.trim() !== '');

                // Extract commit information
                const hash = lines[0]?.trim() || 'Unknown';
                const date = lines[1]?.replace('Date: ', '') || 'Unknown';
                const message = lines.find(line => line.startsWith('Message: '))?.replace('Message: ', '').trim() || 'No message';
                const version = lines.find(line => line.startsWith('Version: '))?.replace('Version: ', '').trim() || '';

                // Look for file changes
                const fileChanges = lines.filter(line => line.startsWith('+++') || line.startsWith('---'));
                const currentFile = fileChanges.length > 0 ? fileChanges[0].replace('+++ b/', '').replace('--- a/', '') : 'Unknown';

                // Look for lines that contain our specific class
                const changes = lines.filter(line => {
                    const hasClass = line.includes(className);
                    const hasNgClass = line.includes('[ngClass]');
                    return (hasClass || hasNgClass) &&
                        (line.startsWith('-') || line.startsWith('+')) &&
                        !line.includes('+++') && !line.includes('---');
                });

                // Only include commits that have relevant changes
                if (changes.length > 0) {
                    output += '-------------------\n';
                    output += `Commit: ${hash}\n`;
                    output += `Date: ${date}\n`;
                    output += `Message: ${message}\n`;
                    if (version) output += `Version: ${version}\n`;
                    output += `File: ${currentFile}\n`;
                    output += '\nClass Changes:\n';

                    // Group changes by pairs to show before/after
                    for (let i = 0; i < changes.length; i++) {
                        const line = changes[i];
                        if (line.startsWith('-') && i + 1 < changes.length && changes[i + 1].startsWith('+')) {
                            output += '\nRemoved: ' + line.substring(1).trim();
                            output += '\nAdded:   ' + changes[i + 1].substring(1).trim() + '\n';
                            i++; // Skip the next line since we've already shown it
                        } else {
                            output += line + '\n';
                        }
                    }

                    // Use AI to analyze complex changes if enabled and within the limit
                    if (USE_AI && aiCallCount < maxAICalls) {
                        const analysis = await analyzeDiffWithAI(changes.join('\n'));
                        output += `\nAI Analysis:\n${analysis}\n`;
                        aiCallCount++; // Increment the API call counter
                    }

                    output += '\n';
                }
            }

            // Ensure output directory exists
            if (!fs.existsSync(OUTPUT_DIR)) {
                fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            }

            // Write results to file
            const outputFile = path.join(OUTPUT_DIR, `${className}-changes.log`);
            fs.writeFileSync(outputFile, output);
            console.log(`Results written to: ${outputFile}`);

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

async function main() {
    try {
        const logFilePath = argv.logFile;
        if (!logFilePath) {
            throw new Error('Please provide the path to the pre-generated log file');
        }

        console.log('Starting search for class name changes...');
        console.log(`Output directory: ${OUTPUT_DIR}`);
        console.log(`Using AI analysis: ${USE_AI ? 'Yes' : 'No'}`);

        // Process each class name sequentially
        for (const className of classNames) {
            console.log(`Processing class: ${className}`);
            await processLogFile(logFilePath, className);
        }

        console.log('\nSearch complete! Check the results directory for logs.');
    } catch (error) {
        console.error('Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();