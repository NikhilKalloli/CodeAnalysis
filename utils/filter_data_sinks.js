const fs = require('fs');

// Configuration
const INPUT_JSON = 'deepseek.json';
const OUTPUT_JSON = 'data_sinks_only.json';

/**
 * Filter data to include only entries where data_sink_presence is "YES"
 */
function filterDataSinks() {
  // Check if input file exists
  if (!fs.existsSync(INPUT_JSON)) {
    console.error(`Error: ${INPUT_JSON} not found.`);
    return false;
  }

  console.log(`Processing ${INPUT_JSON}...`);
  
  try {
    // Read the JSON file
    const data = JSON.parse(fs.readFileSync(INPUT_JSON, 'utf8'));
    
    // Filter entries where data_sink_presence is "YES"
    const filteredData = data.filter(item => item.data_sink_presence === "YES");
    
    console.log(`Found ${filteredData.length} entries with data_sink_presence = "YES" out of ${data.length} total entries`);
    
    // Save the filtered data
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(filteredData, null, 2), 'utf8');
    
    console.log(`Filtered data saved to ${OUTPUT_JSON}`);
    return true;
  } catch (error) {
    console.error(`Error processing JSON: ${error.message}`);
    return false;
  }
}

// Execute the filtering
const success = filterDataSinks();

if (success) {
  console.log('Filtering completed successfully!');
} else {
  console.log('Filtering failed.');
} 