const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = '/Users/cutternaismith/Documents/GitHub/primeng-class-changes-detector/class-changes-results';
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
            
            // Escape the class name to ensure it is valid in the regex
            const escapedClassName = escapeRegex(className);

            // Search for specific class changes
            const git = spawn('git', [
                'log',
                '-p',                         // Show patch
                '--unified=3',                // Show 3 lines of context
                '-G', `(class|className)[^\\w]*(${escapedClassName})(?=[^\\w]|$)`,  // Match the class name exactly
                '--pretty=format:Commit: %h%nDate: %ad%nMessage: %s%nVersion: %d%n',
                '--date=iso',
                '--',                         // Path separator
                '*.ts',                       // TypeScript files
                '*.html',                     // HTML files
                '*.scss',                     // SCSS files
                '*.css'                       // CSS files
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

            git.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Git process exited with code ${code}`));
                    return;
                }

                // Process the git log output
                const commits = gitOutput.split('Commit: ').filter(Boolean);
                
                commits.forEach(commit => {
                    const lines = commit.split('\n').filter(line => line.trim() !== '');
                    
                    // Extract commit information
                    const hash = lines[0]?.trim() || 'Unknown';
                    const date = lines[1]?.replace('Date: ', '') || 'Unknown';
                    const message = lines.find(line => line.startsWith('Message: '))?.replace('Message: ', '').trim() || 'No message';
                    const version = lines.find(line => line.startsWith('Version: '))?.replace('Version: ', '').trim() || '';
                    
                    // Look for lines that contain our specific class
                    const changes = lines.filter(line => {
                        return (line.startsWith('-') || line.startsWith('+')) && 
                               line.includes(className) &&
                               !line.includes('+++') && !line.includes('---');
                    });

                    // Only include commits that have relevant changes
                    if (changes.length > 0) {
                        output += '-------------------\n';
                        output += `Commit: ${hash}\n`;
                        output += `Date: ${date}\n`;
                        output += `Message: ${message}\n`;
                        if (version) output += `Version: ${version}\n`;
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
            reject(error);
        }
    });
}

async function main() {
    const repoPath = process.argv[2];
    if (!repoPath) {
        console.error('Please provide the path to the PrimeNG repository');
        process.exit(1);
    }

    console.log('Starting search for class name changes...');
    console.log(`Output directory: ${OUTPUT_DIR}`);
    
    // Process each class name sequentially
    for (const className of classNames) {
        try {
            await searchClassChanges(repoPath, className);
        } catch (error) {
            console.error(`Failed to process ${className}:`, error);
        }
    }

    console.log('\nSearch complete! Check the results directory for logs.');
}

main();
