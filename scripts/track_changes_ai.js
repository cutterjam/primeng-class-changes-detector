const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { hideBin } = require('yargs/helpers');
const yargs = require('yargs/yargs');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI API
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
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
            'p-menuitem-link',
            'p-menuitem-text',
            'p-menuitem'
        ]
    })
    .option('use-ai', {
        alias: 'a',
        type: 'boolean',
        description: 'Use AI to analyze complex changes',
        default: false
    })
    .argv;

const OUTPUT_DIR = argv.outputDir;
const classNames = argv.classNames;
const USE_AI = argv.useAi;

function escapeRegex(str) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
}

async function analyzeDiffWithAI(diff) {
    if (!diff || typeof diff !== 'string') {
        console.warn('Invalid diff provided to AI analysis');
        return '';
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: "Analyze the following code diff and identify any changes to class names, especially in ngClass expressions." 
                },
                { 
                    role: "user", 
                    content: diff 
                }
            ]
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        return `Failed to analyze changes with AI: ${error.message}`;
    }
}

async function analyzeDiffsWithAI(diffs) {
    const batchSize = 10;
    const results = [];

    for (let i = 0; i < diffs.length; i += batchSize) {
        const batch = diffs.slice(i, i + batchSize);
        const batchPromises = batch.map(diff => analyzeDiffWithAI(diff));
        
        try {
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        } catch (error) {
            console.error('Error processing batch:', error);
        }
    }

    return results;
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

function scoreCommit(changes) {
    let score = 0;
    score += changes.length;
    if (changes.some(line => line.includes('[ngClass]'))) {
        score += 10;
    }
    return score;
}

async function searchClassChanges(repoPath, className) {
    return new Promise((resolve, reject) => {
        try {
            process.chdir(repoPath);
            const escapedClassName = escapeRegex(className);

            const git = spawn('git', [
                'log',
                '-p',
                '--unified=3',
                '-G', `(class|className|\\[ngClass\\])\\s*[=:]\\s*["'{][^"'}]*\\b${escapedClassName}\\b`,
                '--pretty=format:Commit: %h%nDate: %ad%nMessage: %s%nVersion: %d%n',
                '--date=iso',
                '--',
                '*.ts',
                '*.html',
                '*.scss',
                '*.css'
            ]);

            let output = `PrimeNG Changes for ${className} (v17-v19)\n`;
            output += '============================\n\n';

            let gitOutput = '';
            git.stdout.on('data', (data) => {
                gitOutput += data.toString();
            });

            git.stderr.on('data', (data) => {
                console.error('Git Error:', data.toString());
            });

            git.on('close', async (code) => {
                if (code !== 0) {
                    reject(new Error(`Git process exited with code ${code}`));
                    return;
                }

                const commits = gitOutput.split('Commit: ').filter(Boolean);
                const scoredCommits = commits.map(commit => {
                    const lines = commit.split('\n').filter(line => line.trim() !== '');
                    const changes = lines.filter(line => {
                        const hasClass = line.includes(className);
                        const hasNgClass = line.includes('[ngClass]');
                        return (hasClass || hasNgClass) &&
                            (line.startsWith('-') || line.startsWith('+')) &&
                            !line.includes('+++') && !line.includes('---');
                    });
                    return {
                        commit,
                        lines,
                        changes,
                        score: scoreCommit(changes)
                    };
                }).sort((a, b) => b.score - a.score);

                // Combine all changes for each commit into a single string
                const relevantDiffs = scoredCommits
                    .filter(({ changes }) => changes.length > 0)
                    .map(({ commit, changes }) => {
                        const commitInfo = commit.split('\n')[0];
                        return `${commitInfo}\n${changes.join('\n')}`;
                    });

                if (USE_AI && relevantDiffs.length > 0) {
                    const analysisResults = await analyzeDiffsWithAI(relevantDiffs);
                    output += '\nAI Analysis:\n';
                    analysisResults.forEach((analysis, index) => {
                        if (analysis) {
                            output += `\nAnalysis ${index + 1}:\n${analysis}\n`;
                        }
                    });
                }

                const outputFile = path.join(OUTPUT_DIR, `${className}-changes.log`);
                fs.writeFileSync(outputFile, output);
                console.log(`Results written to: ${outputFile}`);

                resolve();
            });

        } catch (error) {
            reject(error);
        }
    });
}

async function main() {
    try {
        const repoPath = process.argv[2];
        if (!repoPath) {
            throw new Error('Please provide the path to the PrimeNG repository');
        }

        console.log('Starting search for class name changes...');
        console.log(`Output directory: ${OUTPUT_DIR}`);
        console.log(`Using AI analysis: ${USE_AI ? 'Yes' : 'No'}`);

        await Promise.all(classNames.map(async (className) => {
            console.log(`Processing class: ${className}`);
            await searchClassChanges(repoPath, className);
        }));

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