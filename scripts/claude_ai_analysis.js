const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getProxyForUrl } = require('proxy-from-env');
require('dotenv').config();

// Configuration
const LOG_DIR = '/Users/I6105/Documents/GitHub/class-changes-results/output';
const REPORT_DIR = '/Users/I6105/Documents/GitHub/class-changes-results/reports';
const API_KEY = process.env.ANTHROPIC_API_KEY;

// First install this package: npm install proxy-from-env
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const proxyUrl = getProxyForUrl(ANTHROPIC_API_URL);

console.log('Starting PrimeNG class changes analysis...');
console.log(`Looking for log files in: ${LOG_DIR}`);
console.log(`Using detected proxy: ${proxyUrl || 'None detected - using direct connection'}`);

// The rest of your script remains the same, but add the following to your axios config:
const axiosConfig = {
  headers: {
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  proxy: proxyUrl ? {
    host: new URL(proxyUrl).hostname,
    port: parseInt(new URL(proxyUrl).port),
    protocol: new URL(proxyUrl).protocol.replace(':', '')
  } : false
};

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  console.log(`Created report directory: ${REPORT_DIR}`);
}

// Get all log files
const logFiles = fs.readdirSync(LOG_DIR)
  .filter(file => file.endsWith('-changes.log'));

console.log(`Found ${logFiles.length} log files to process`);
// Rest of your code remains the same...

// Process each log file
async function processLogFiles() {
  console.log('Beginning analysis of log files...');
  
  for (const logFile of logFiles) {
    const filePath = path.join(LOG_DIR, logFile);
    const className = path.basename(logFile, '-changes.log');
    
    console.log(`\nProcessing ${className}...`);
    
    try {
      // Check if file exists and has content
      const stats = fs.statSync(filePath);
      console.log(`  - File size: ${stats.size} bytes`);
      
      if (stats.size === 0) {
        console.log(`  - Skipping empty file: ${logFile}`);
        continue;
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`  - Successfully read file content`);
      
      // Check for API key
      if (!API_KEY) {
        throw new Error('No API key found. Set ANTHROPIC_API_KEY environment variable.');
      }
      
      console.log(`  - Sending to AI for analysis...`);
      const analysis = await analyzeWithAI(className, content);
      console.log(`  - Analysis received (${analysis.length} characters)`);
      
      // Save the report
      const reportPath = path.join(REPORT_DIR, `${className}-analysis.md`);
      fs.writeFileSync(reportPath, analysis);
      
      console.log(`  - Analysis saved to ${reportPath}`);
    } catch (error) {
      console.error(`  - ERROR analyzing ${className}: ${error.message}`);
      if (error.response) {
        console.error(`  - API response status: ${error.response.status}`);
        console.error(`  - API response data:`, error.response.data);
      }
    }
  }
  
  console.log('\nAnalysis complete!');
}

// Send to AI for analysis
async function analyzeWithAI(className, logContent) {
  console.log(`  - Preparing prompt for ${className}`);
  
  const prompt = `
    You are an expert in analyzing CSS class name changes in the PrimeNG library.
    
    Please analyze the following change log for the '${className}' class and provide:
    
    1. A clear summary of the most important class name changes
    2. High confidence replacements (67%+ similarity)
    3. Identification of any ambiguous bidirectional changes
    4. Notes on structural changes (added attributes, CSS selector modifications)
    5. Implementation recommendations for updating theme files
    
    Format your response as a Markdown document with a title and clear sections.
    
    Here is the log content:
    
    ${logContent}
  `;
  
  console.log(`  - Sending request to Anthropic API`);
  
  try {
    // Example using Anthropic's API
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 4000,
        messages: [
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );
    
    console.log(`  - Received successful response from API`);
    return response.data.content[0].text;
  } catch (error) {
    console.error(`  - API call failed: ${error.message}`);
    throw error; // Re-throw to be handled by the caller
  }
}

// Run the script
processLogFiles().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});