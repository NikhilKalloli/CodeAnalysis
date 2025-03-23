const fs = require('fs');
const path = require('path');

// Configuration
const INPUT_JSON = 'data_sinks_only.json';  // Change this to your source JSON file
const OUTPUT_FILE = 'filepaths.txt'; // Output file for the list of filepaths

/**
 * Extract all filepaths from the JSON data
 */
function extractFilepaths() {
  // Check if input file exists
  if (!fs.existsSync(INPUT_JSON)) {
    console.error(`Error: ${INPUT_JSON} not found.`);
    return false;
  }

  console.log(`Processing ${INPUT_JSON}...`);
  
  try {
    // Read the JSON file
    const data = JSON.parse(fs.readFileSync(INPUT_JSON, 'utf8'));
    
    // Extract all filepaths
    const filepaths = data
      .filter(item => item.filepath)  // Filter out any items without filepath
      .map(item => item.filepath)     // Extract just the filepath
      .sort();                        // Sort alphabetically for readability
    
    // Write the filepaths to a text file, one per line
    fs.writeFileSync(OUTPUT_FILE, filepaths.join('\n'), 'utf8');
    
    console.log(`Extracted ${filepaths.length} filepaths out of ${data.length} total entries`);
    console.log(`Filepaths saved to ${OUTPUT_FILE}`);
    
    return true;
  } catch (error) {
    console.error(`Error processing JSON: ${error.message}`);
    return false;
  }
}

// Execute the extraction
const success = extractFilepaths();

if (success) {
  console.log('Extraction completed successfully!');
} else {
  console.log('Extraction failed.');
} 