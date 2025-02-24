const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config(); // Add this to load environment variables from .env file

// Configuration
const LOG_DIR = '/Users/cutternaismith/Documents/GitHub/primeng-class-changes-detector/log_files';
const REPORT_DIR = '/Users/cutternaismith/Documents/GitHub/primeng-class-changes-detector/reports';
const API_KEY = process.env.ANTHROPIC_API_KEY; // Get from environment variable

console.log('Starting PrimeNG class changes analysis...');
console.log(`Looking for log files in: ${LOG_DIR}`);

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  console.log(`Created report directory: ${REPORT_DIR}`);
}

// Get all log files
const logFiles = fs.readdirSync(LOG_DIR)
  .filter(file => file.endsWith('-changes.log'));

console.log(`Found ${logFiles.length} log files to process`);

// Process each log file
async function processLogFiles() {
  console.log('Beginning analysis of log files...');
  
  for (const logFile of logFiles) {
    const filePath = path.join(LOG_DIR, logFile);
    const className = path.basename(logFile, '-changes.log');
    
    console.log(`\nProcessing ${className}...`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`- Read file: ${filePath}`);
      
      const analysis = await analyzeWithAI(className, content);
      console.log(`- Completed analysis`);
      
      // Save the report
      const reportPath = path.join(REPORT_DIR, `${className}-analysis.md`);
      fs.writeFileSync(reportPath, analysis);
      
      console.log(`- Analysis saved to ${reportPath}`);
    } catch (error) {
      console.error(`ERROR analyzing ${className}:`, error.message);
    }
  }
  
  console.log('\nAnalysis complete!');
}

// Send to AI for analysis
async function analyzeWithAI(className, logContent) {
  console.log(`- Sending ${className} to Anthropic API for analysis...`);
  
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
  
  return response.data.content[0].text;
}

// Run the script
processLogFiles().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});