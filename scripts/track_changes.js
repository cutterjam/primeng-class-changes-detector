const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = '/Users/cutternaismith/Documents/GitHub/primeng-class-changes-detector/output';
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

// Instead of hard-coding commits, detect bulk removals automatically
function isBulkRemovalCommit(changes) {
    // If there are too many identical or very similar changes in one commit, it's likely a bulk removal
    const BULK_THRESHOLD = 15; // Consider it a bulk change if more than 15 similar changes
    
    // Count occurrences of similar patterns
    const patternCounts = new Map();
    
    changes.forEach(line => {
        // Extract the class selector pattern (e.g., ".p-menuitem-text" from a longer selector)
        const match = line.match(/(\.[a-zA-Z0-9_-]+)/g);
        if (match) {
            match.forEach(pattern => {
                patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
            });
        }
    });
    
    // Check if any pattern exceeds the threshold
    for (const [pattern, count] of patternCounts.entries()) {
        if (count > BULK_THRESHOLD) {
            console.log(`Detected bulk removal pattern: ${pattern} (${count} occurrences)`);
            return true;
        }
    }
    
    return false;
}

// Define patterns that indicate non-meaningful changes
const IGNORE_PATTERNS = [
    'theme.css',
    'unused',
    'remove deprecated'
];

function escapeRegex(str) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
}

function deduplicateChanges(changes) {
    // Create a map to deduplicate changes
    const uniqueChanges = new Map();
    
    changes.forEach(line => {
        const normalizedLine = line.substring(1).trim(); // Remove +/- and whitespace
        const changeType = line.startsWith('+') ? 'added' : 'removed';
        
        if (!uniqueChanges.has(normalizedLine)) {
            uniqueChanges.set(normalizedLine, { line, changeType, count: 1 });
        } else {
            uniqueChanges.get(normalizedLine).count++;
        }
    });
    
    // Convert map back to array and filter out entries with counts > 3 (likely bulk changes)
    return Array.from(uniqueChanges.values())
        .filter(entry => entry.count <= 3) // Filter out highly repetitive changes
        .map(entry => entry.line);
}

function shouldSkipCommit(hash, message, changes) {
    // Skip commits with certain patterns in the message
    for (const pattern of IGNORE_PATTERNS) {
        if (message.toLowerCase().includes(pattern.toLowerCase())) {
            console.log(`Skipping commit due to message pattern: "${pattern}"`);
            return true;
        }
    }
    
    // Detect and skip bulk removal commits based on the changes themselves
    if (isBulkRemovalCommit(changes)) {
        console.log(`Skipping commit ${hash} as it appears to be a bulk removal`);
        return true;
    }
    
    return false;
}

function searchClassChanges(repoPath, className) {
    return new Promise((resolve, reject) => {
        try {
            process.chdir(repoPath);
            
            // Escape the class name to ensure it is valid in the regex
            const escapedClassName = escapeRegex(className);

            // Create a Git-compatible regex that strictly matches only the exact class name
            // Looking for the class name surrounded by quotes, spaces, or other non-alphanumeric characters
            const gitRegex = `[^a-zA-Z0-9_-]${escapedClassName}[^a-zA-Z0-9_-]`;
            
            console.log(`Using Git regex for strict matching: ${gitRegex}`);
            
            const git = spawn('git', [
                'log',
                '-p',                        // Show patch
                '--unified=3',               // Show 3 lines of context
                '-G', gitRegex,              // Strict regex for exact class name
                '--pretty=format:Commit: %h%nDate: %ad%nMessage: %s%nVersion: %d%n',
                '--date=iso',
                '--',                        // Path separator
                '*.ts',                      // TypeScript files
                '*.html',                    // HTML files
                '*.scss',                    // SCSS files
                '*.css'                      // CSS files
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

                console.log(`Git output size for ${className}: ${gitOutput.length} characters`);
                
                if (gitOutput.length === 0) {
                    console.log(`No changes found for class: ${className}`);
                    output += 'No changes found for this class name.\n';
                    
                    // Ensure output directory exists
                    if (!fs.existsSync(OUTPUT_DIR)) {
                        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
                    }
                    
                    const outputFile = path.join(OUTPUT_DIR, `${className}-changes.log`);
                    fs.writeFileSync(outputFile, output);
                    console.log(`Results written to: ${outputFile}`);
                    
                    resolve();
                    return;
                }

                // Process the git log output
                const commits = gitOutput.split('Commit: ').filter(Boolean);
                console.log(`Found ${commits.length} commits with possible changes for ${className}`);
                
                let relevantCommitCount = 0;
                let totalChangesFiltered = 0;
                
                commits.forEach(commit => {
                    const lines = commit.split('\n').filter(line => line.trim() !== '');
                    
                    // Extract commit information
                    const hash = lines[0]?.trim() || 'Unknown';
                    const date = lines[1]?.replace('Date: ', '') || 'Unknown';
                    const message = lines.find(line => line.startsWith('Message: '))?.replace('Message: ', '').trim() || 'No message';
                    const version = lines.find(line => line.startsWith('Version: '))?.replace('Version: ', '').trim() || '';
                    
                    // Look for lines with EXACTLY the class name - not as part of other words
                    const changes = lines.filter(line => {
                        // Must be a diff line
                        const isDiffLine = (line.startsWith('-') || line.startsWith('+')) && 
                                          !line.includes('+++') && !line.includes('---');
                        if (!isDiffLine) return false;
                        
                        // Use JavaScript's regex capabilities to ensure exact match
                        // This matches the class name surrounded by any non-alphanumeric characters
                        // to prevent partial matches like "p-menubar-button" when looking for "p-menubar"
                        const exactClassRegex = new RegExp(`[^a-zA-Z0-9_-]${escapedClassName}[^a-zA-Z0-9_-]|^${escapedClassName}[^a-zA-Z0-9_-]|[^a-zA-Z0-9_-]${escapedClassName}$`);
                        return exactClassRegex.test(line);
                    });

                    // Skip commits that match our filter criteria
                    // We evaluate this AFTER finding changes to detect bulk removals
                    if (shouldSkipCommit(hash, message, changes)) {
                        console.log(`Skipping commit ${hash}: "${message}" - matches filter criteria`);
                        totalChangesFiltered++;
                        return;
                    }
                    
                    // Deduplicate the changes to avoid repetitive entries
                    const uniqueChanges = deduplicateChanges(changes);

                    // Only include commits that have relevant changes after deduplication
                    if (uniqueChanges.length > 0) {
                        relevantCommitCount++;
                        output += '-------------------\n';
                        output += `Commit: ${hash}\n`;
                        output += `Date: ${date}\n`;
                        output += `Message: ${message}\n`;
                        if (version) output += `Version: ${version}\n`;
                        output += '\nClass Changes:\n';
                        
                        // Filter file paths to show context
                        const filePaths = lines.filter(line => 
                            line.startsWith('+++') || line.startsWith('---')
                        ).slice(0, 2); // Just get the file being changed
                        
                        if (filePaths.length > 0) {
                            output += `File: ${filePaths[filePaths.length - 1].replace(/^(\+\+\+|\-\-\-) (b\/|a\/)?/, '')}\n\n`;
                        }
                        
                        // Group changes by pairs to show before/after
                        for (let i = 0; i < uniqueChanges.length; i++) {
                            const line = uniqueChanges[i];
                            if (line.startsWith('-') && i + 1 < uniqueChanges.length && uniqueChanges[i + 1].startsWith('+')) {
                                output += 'Removed: ' + line.substring(1).trim() + '\n';
                                output += 'Added:   ' + uniqueChanges[i + 1].substring(1).trim() + '\n\n';
                                i++; // Skip the next line since we've already shown it
                            } else {
                                output += (line.startsWith('-') ? 'Removed: ' : 'Added:   ') + 
                                         line.substring(1).trim() + '\n\n';
                            }
                        }
                    }
                });

                console.log(`Found ${relevantCommitCount} commits with relevant changes for ${className}`);
                console.log(`Filtered out ${totalChangesFiltered} commits based on filter criteria`);

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
            console.log(`\nProcessing class: ${className}`);
            await searchClassChanges(repoPath, className);
        } catch (error) {
            console.error(`Failed to process ${className}:`, error);
        }
    }

    console.log('\nSearch complete! Check the results directory for logs.');
}

main();