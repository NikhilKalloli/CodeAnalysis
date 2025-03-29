const fs = require('fs');

// Function to analyze the JSON data
function analyzeNodeTypes(jsonFile) {
  // Read and parse the JSON file
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  
  // Sets to store unique values
  const uniqueNodeTypes = new Set();
  const uniqueCaptureTypes = new Set();
  const nodeCaptureMap = new Map();
  
  // Process each item
  data.forEach(item => {
    if (item.nodeType && item.captureType) {
      uniqueNodeTypes.add(item.nodeType);
      uniqueCaptureTypes.add(item.captureType);
      
      // Track which capture types appear with which node types
      const key = item.nodeType;
      if (!nodeCaptureMap.has(key)) {
        nodeCaptureMap.set(key, new Set());
      }
      nodeCaptureMap.get(key).add(item.captureType);
    }
  });
  
  // Convert sets to sorted arrays
  const nodeTypes = [...uniqueNodeTypes].sort();
  const captureTypes = [...uniqueCaptureTypes].sort();
  
  // Create the node to capture mapping
  const nodeToCaptures = {};
  nodeCaptureMap.forEach((captures, nodeType) => {
    nodeToCaptures[nodeType] = [...captures].sort();
  });
  
  // Prepare results
  const results = {
    uniqueNodeTypes: nodeTypes,
    uniqueCaptureTypes: captureTypes,
    nodeTypesCount: nodeTypes.length,
    captureTypesCount: captureTypes.length,
    nodeToCaptures: nodeToCaptures
  };
  
  return results;
}

// Run the analysis and output results
function main() {
  const results = analyzeNodeTypes('./query-results.json');
  
  console.log('=== UNIQUE NODE TYPES ===');
  console.log(results.uniqueNodeTypes);
  console.log(`Total unique node types: ${results.nodeTypesCount}`);    
  
  console.log('\n=== UNIQUE CAPTURE TYPES ===');
  console.log(results.uniqueCaptureTypes);
  console.log(`Total unique capture types: ${results.captureTypesCount}`);
  
  console.log('\n=== NODE TYPE TO CAPTURE TYPES MAPPING ===');
  Object.entries(results.nodeToCaptures).forEach(([nodeType, captures]) => {
    console.log(`${nodeType}: ${captures.join(', ')}`);
  });
  
  // Save results to a file
  fs.writeFileSync(
    './node-analysis-results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\nResults saved to node-analysis-results.json');
}

main();