const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = './class-changes-results/output';
const classNames = [
    'p-menubar',
    'p-menuitem-link',
    'p-menuitem-text',
    'p-menuitem',
    'p-menubar-root-list',
    'p-submenu-list',
    'p-submenu-icon',
    'p-menubar-custom',
    'p-menubar-end',
    'p-menubar-button'
];

function escapeRegex(str) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
}

function searchClassChanges(repoPath, className) {
    return new Promise((resolve, reject) => {
        try {
            process.chdir(repoPath);
            
            // Escape the class name for regex
            const escapedClassName = escapeRegex(className);
            
            // Use a simple regex that will catch any occurrence of the class name
            const git = spawn('git', [
                'log',
                '-p',                        // Show patch
                '--unified=3',               // Show 3 lines of context
                '-G', escapedClassName,      // Find commits with changes containing the class name
                '--pretty=format:Commit: %h%nDate: %ad%nMessage: %s%n',
                '--date=iso',
                '--',                        // Path separator
                '*.ts',                      // TypeScript files
                '*.html',                    // HTML files
                '*.scss',                    // SCSS files
                '*.css'                      // CSS files
            ]);

            let output = `PrimeNG Changes for ${className}\n`;
            output += '============================\n\n';

            let gitOutput = '';
            git.stdout.on('data', (data) => {
                gitOutput += data.toString();
            });

            git.stderr.on('data', (data) => {
                console.error('Git Error:', data.toString());
            });

            git.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Git process exited with code ${code}`));
                    return;
                }

                if (gitOutput.length === 0) {
                    console.log(`No changes found for class: ${className}`);
                    output += 'No changes found for this class name.\n';
                    
                    // Ensure output directory exists
                    if (!fs.existsSync(OUTPUT_DIR)) {
                        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
                    }
                    
                    const outputFile = path.join(OUTPUT_DIR, `${className}-changes.log`);
                    fs.writeFileSync(outputFile, output);
                    
                    resolve();
                    return;
                }

                // Process the git log output
                const commits = gitOutput.split('Commit: ').filter(Boolean);
                console.log(`Found ${commits.length} commits with possible changes for ${className}`);
                
                commits.forEach(commit => {
                    const lines = commit.split('\n');
                    
                    // Extract commit information
                    const hash = lines[0]?.trim() || 'Unknown';
                    const date = lines[1]?.replace('Date: ', '') || 'Unknown';
                    const message = lines[2]?.replace('Message: ', '') || 'No message';
                    
                    // Extract diff lines related to the class
                    const diffLines = [];
                    let inRelevantDiff = false;
                    let relevantFile = '';
                    
                    for (let i = 3; i < lines.length; i++) {
                        const line = lines[i];
                        
                        // Track file names in diffs
                        if (line.startsWith('+++') || line.startsWith('---')) {
                            if (line.startsWith('+++')) {
                                relevantFile = line.replace(/^\+\+\+ (b\/)?/, '');
                            }
                            continue;
                        }
                        
                        // Check if the line is a diff line with the class name
                        const isDiffLine = (line.startsWith('-') || line.startsWith('+')) && 
                                           !line.includes('+++') && !line.includes('---');
                        
                        if (isDiffLine && line.includes(className)) {
                            inRelevantDiff = true;
                            diffLines.push(line);
                        } else if (inRelevantDiff && isDiffLine) {
                            // Keep nearby diff lines for context
                            diffLines.push(line);
                            // Reset if we're too far from a relevant line
                            if (diffLines.length > 10) {
                                inRelevantDiff = false;
                            }
                        } else if (line.trim() === '') {
                            inRelevantDiff = false;
                        }
                    }
                    
                    // Only include commits with relevant diff lines
                    if (diffLines.length > 0) {
                        output += '-------------------\n';
                        output += `Commit: ${hash}\n`;
                        output += `Date: ${date}\n`;
                        output += `Message: ${message}\n`;
                        output += `File: ${relevantFile}\n\n`;
                        output += 'Class Changes:\n';
                        
                        // Output the diff lines
                        diffLines.forEach(line => {
                            output += line + '\n';
                        });
                        
                        output += '\n';
                    }
                });

                // Ensure output directory exists
                if (!fs.existsSync(OUTPUT_DIR)) {
                    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
                }

                // Write results to file
                const outputFile = path.join(OUTPUT_DIR, `${className}-changes.log`);
                fs.writeFileSync(outputFile, output);
                console.log(`Results written to: ${outputFile}`);
                
                resolve();
            });

        } catch (error) {
            console.error("Error in searchClassChanges:", error);
            reject(error);
        }
    });
}

// Create a combined log file with all changes
async function createCombinedLog(repoPath) {
    let combinedOutput = 'PrimeNG Class Changes Summary\n';
    combinedOutput += '===========================\n\n';
    
    for (const className of classNames) {
        const outputFile = path.join(OUTPUT_DIR, `${className}-changes.log`);
        if (fs.existsSync(outputFile)) {
            const content = fs.readFileSync(outputFile, 'utf-8');
            combinedOutput += content + '\n\n';
        }
    }
    
    const combinedFile = path.join(OUTPUT_DIR, 'all-class-changes.log');
    fs.writeFileSync(combinedFile, combinedOutput);
    console.log(`Combined results written to: ${combinedFile}`);
}

async function main() {
    const repoPath = process.argv[2];
    if (!repoPath) {
        console.error('Please provide the path to the PrimeNG repository');
        process.exit(1);
    }

    console.log('Starting search for class name changes...');
    console.log(`Output directory: ${OUTPUT_DIR}`);
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Process each class name sequentially
    for (const className of classNames) {
        try {
            console.log(`\nProcessing class: ${className}`);
            await searchClassChanges(repoPath, className);
        } catch (error) {
            console.error(`Failed to process ${className}:`, error);
        }
    }
    
    // Create a combined log for easier analysis
    await createCombinedLog(repoPath);

    console.log('\nSearch complete! Check the results directory for logs.');
}

main();