const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Configuration
const LOG_DIR = '/Users/cutternaismith/Documents/GitHub/primeng-class-changes-detector/output';
const REPORT_DIR = '/Users/cutternaismith/Documents/GitHub/primeng-class-changes-detector/reports';
const API_KEY = process.env.ANTHROPIC_API_KEY;

// Rate limiting configuration
const RETRY_DELAY = 60000;  // 60 seconds between retries
const REQUEST_DELAY = 5000; // 5 seconds between successful requests
const MAX_RETRIES = 5;      // Maximum retry attempts

// Chunking configuration
const MAX_CHUNK_SIZE = 70000; // Maximum characters per chunk (well under the 200K token limit)
const MAX_CHUNKS = 10;        // Maximum number of chunks to process per file

console.log('Starting PrimeNG class changes analysis with chunking...');
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

// Simple delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Split log content into chunks by commit boundaries
 * @param {string} content The log file content
 * @returns {Array<string>} Array of chunks
 */
function splitIntoChunks(content) {
  // First split by the commit separator
  const commitSections = content.split(/^---+$/m).filter(Boolean);
  
  console.log(`- Identified ${commitSections.length} commit sections`);
  
  const chunks = [];
  let currentChunk = '';
  let chunkSize = 0;
  
  // Process each commit section
  for (const section of commitSections) {
    // If adding this section would exceed our chunk size limit
    if (chunkSize + section.length > MAX_CHUNK_SIZE && currentChunk !== '') {
      chunks.push(currentChunk);
      currentChunk = '';
      chunkSize = 0;
    }
    
    // Add the commit section to the current chunk
    if (currentChunk !== '') {
      currentChunk += '\n-------------------\n';
    }
    currentChunk += section;
    chunkSize += section.length;
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk !== '') {
    chunks.push(currentChunk);
  }
  
  // Limit the number of chunks to prevent excessive API calls
  const limitedChunks = chunks.slice(0, MAX_CHUNKS);
  
  console.log(`- Split content into ${chunks.length} chunks (using ${limitedChunks.length})`);
  if (chunks.length > MAX_CHUNKS) {
    console.log(`- WARNING: Only processing the first ${MAX_CHUNKS} chunks`);
  }
  
  return limitedChunks;
}

/**
 * Create a prompt for the chunked content
 * @param {string} className The class name
 * @param {string} chunk The chunk content
 * @param {number} chunkNum The chunk number
 * @param {number} totalChunks Total number of chunks
 * @returns {string} The prompt
 */
function createChunkPrompt(className, chunk, chunkNum, totalChunks) {
  return `
You are an expert in analyzing CSS class name changes in the PrimeNG library.

Please analyze the following change log for the '${className}' class - CHUNK ${chunkNum}/${totalChunks}.

Please provide:

1. A clear summary of the most important class name changes in this chunk
2. High confidence replacements 
3. Identification of any ambiguous bidirectional changes
4. Notes on structural changes (added attributes, CSS selector modifications)

Format your response as a Markdown document with sections.

NOTE: This is chunk ${chunkNum} of ${totalChunks} for this class. Analyze only what you see in this chunk.

Here is the log content for this chunk:

${chunk}
`;
}

/**
 * Create a prompt to combine chunk analyses
 * @param {string} className The class name
 * @param {Array<string>} chunkAnalyses Array of analyses for each chunk
 * @returns {string} The combination prompt
 */
function createCombinationPrompt(className, chunkAnalyses) {
  return `
You are an expert in analyzing CSS class name changes in the PrimeNG library.

I've previously analyzed the changes for the '${className}' class in multiple chunks.
Below are the individual analyses for each chunk.

Please combine these analyses into a single comprehensive report, removing duplicates,
resolving any contradictions, and providing a unified set of conclusions.

Your final report should include:

1. A clear summary of the most important class name changes
2. High confidence replacements 
3. Identification of any ambiguous bidirectional changes
4. Notes on structural changes (added attributes, CSS selector modifications)
5. Implementation recommendations for updating theme files

Format your response as a Markdown document with appropriate sections.
Do not mention that this was combined from multiple analyses.

Here are the individual chunk analyses:

${chunkAnalyses.join('\n\n=== NEXT CHUNK ANALYSIS ===\n\n')}
`;
}

/**
 * Process a single log file
 * @param {string} logFile The log file name
 */
async function processLogFile(logFile) {
  const filePath = path.join(LOG_DIR, logFile);
  const className = path.basename(logFile, '-changes.log');
  
  console.log(`\nProcessing ${className}...`);
  
  try {
    // Check if we already have an analysis for this class
    const reportPath = path.join(REPORT_DIR, `${className}-analysis.md`);
    if (fs.existsSync(reportPath)) {
      console.log(`- Analysis already exists for ${className}, skipping...`);
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`- Read file: ${filePath} (${content.length} bytes)`);
    
    // For very large files, we need to split them into chunks
    const chunks = splitIntoChunks(content);
    
    // If the file is too big to process even with chunking, skip it
    if (chunks.length === 0) {
      console.log(`- File too large to process, skipping ${className}`);
      return;
    }
    
    // Process each chunk
    const chunkAnalyses = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNum = i + 1;
      
      console.log(`- Processing chunk ${chunkNum}/${chunks.length} (${chunk.length} bytes)`);
      
      // Skip empty chunks
      if (chunk.trim().length === 0) {
        console.log(`- Chunk ${chunkNum} is empty, skipping`);
        continue;
      }
      
      // Check if chunk is too large
      if (chunk.length > 500000) {
        console.log(`- Chunk ${chunkNum} is too large (${chunk.length} bytes), skipping`);
        continue;
      }
      
      const prompt = createChunkPrompt(className, chunk, chunkNum, chunks.length);
      
      // Analyze chunk with retries
      let retries = 0;
      let analysis = null;
      let success = false;
      
      while (retries <= MAX_RETRIES && !success) {
        try {
          if (retries > 0) {
            const waitTime = RETRY_DELAY * Math.pow(1.5, retries - 1); // Exponential backoff
            console.log(`- Retry attempt ${retries}/${MAX_RETRIES} after ${waitTime/1000} seconds...`);
            await delay(waitTime);
          }
          
          // Analyze the chunk
          analysis = await analyzeWithAI(className, prompt);
          console.log(`- Completed analysis for chunk ${chunkNum}`);
          success = true;
          
          // Save the chunk analysis
          chunkAnalyses.push(analysis);
          
          // Add a delay to avoid rate limits
          console.log(`- Waiting ${REQUEST_DELAY/1000} seconds before next chunk/API call...`);
          await delay(REQUEST_DELAY);
          
        } catch (error) {
          if (error.response && error.response.status === 429 && retries < MAX_RETRIES) {
            console.log(`- Rate limited (429). Will retry chunk ${chunkNum}...`);
            retries++;
          } else if (error.response && error.response.status === 400 && 
                    error.response.data?.error?.message?.includes('too long')) {
            console.log(`- Chunk ${chunkNum} is too large for API. Skipping this chunk.`);
            break; // Skip this chunk and move to the next
          } else {
            // Either not a rate limit error, or we've exhausted retries
            console.error(`- API request failed for chunk ${chunkNum}: ${error.message}`);
            if (error.response) {
              console.error(`- Status: ${error.response.status}`);
              console.error(`- Response:`, error.response.data);
            }
            throw error;
          }
        }
      }
    }
    
    // If we have analysis from multiple chunks, combine them
    let finalAnalysis;
    
    if (chunkAnalyses.length === 0) {
      throw new Error(`No successful analyses for any chunks of ${className}`);
    } else if (chunkAnalyses.length === 1) {
      finalAnalysis = chunkAnalyses[0];
      console.log(`- Using single chunk analysis for ${className}`);
    } else {
      console.log(`- Combining ${chunkAnalyses.length} chunk analyses for ${className}...`);
      // Add extra delay before combination request to avoid rate limits
      await delay(REQUEST_DELAY * 2);
      
      // Create a combination prompt
      const combinationPrompt = createCombinationPrompt(className, chunkAnalyses);
      
      // Send combination request with retries
      let retries = 0;
      let success = false;
      
      while (retries <= MAX_RETRIES && !success) {
        try {
          if (retries > 0) {
            const waitTime = RETRY_DELAY * Math.pow(2, retries - 1); // Exponential backoff
            console.log(`- Retry attempt ${retries}/${MAX_RETRIES} for combination after ${waitTime/1000} seconds...`);
            await delay(waitTime);
          }
          
          finalAnalysis = await analyzeWithAI(className, combinationPrompt);
          console.log(`- Completed combined analysis for ${className}`);
          success = true;
          
        } catch (error) {
          if (error.response && error.response.status === 429 && retries < MAX_RETRIES) {
            console.log(`- Rate limited (429) for combination. Will retry...`);
            retries++;
          } else {
            console.error(`- API request failed for combination: ${error.message}`);
            if (error.response) {
              console.error(`- Status: ${error.response.status}`);
              console.error(`- Response:`, error.response.data);
            }
            throw error;
          }
        }
      }
      
      if (!success) {
        // If combining failed, just concatenate the chunks with headers
        console.log(`- Falling back to simple concatenation of chunk analyses`);
        finalAnalysis = `# ${className} Class Changes Analysis\n\n`;
        finalAnalysis += `⚠️ *Note: This analysis is split into ${chunkAnalyses.length} sections due to the large amount of data.*\n\n`;
        
        for (let i = 0; i < chunkAnalyses.length; i++) {
          finalAnalysis += `## Part ${i+1} of ${chunkAnalyses.length}\n\n`;
          finalAnalysis += chunkAnalyses[i];
          finalAnalysis += '\n\n---\n\n';
        }
      }
    }
    
    // Save the final report
    fs.writeFileSync(reportPath, finalAnalysis);
    console.log(`- Final analysis saved to ${reportPath}`);
    
  } catch (error) {
    console.error(`ERROR analyzing ${className}:`, error.message);
  }
}

/**
 * Send a prompt to Anthropic API
 * @param {string} className Class name for logging
 * @param {string} prompt The prompt content
 * @returns {Promise<string>} API response text
 */
async function analyzeWithAI(className, prompt) {
  console.log(`- Sending request to Anthropic API...`);
  
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: "claude-3-7-sonnet-latest",
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
  } catch (error) {
    console.error(`- API request failed`);
    throw error;
  }
}

// Process all log files in sequence
async function processAllLogFiles() {
  console.log('Beginning analysis of log files...');
  
  for (const logFile of logFiles) {
    await processLogFile(logFile);
    
    // Add a delay between files
    console.log(`- Waiting ${REQUEST_DELAY/1000} seconds before processing next file...`);
    await delay(REQUEST_DELAY);
  }
  
  console.log('\nAnalysis complete!');
}

// Run the script
processAllLogFiles().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});