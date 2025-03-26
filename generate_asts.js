const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { parse } = require('@typescript-eslint/typescript-estree');

// Path to the CSV file
const csvFilePath = path.join(__dirname, 'prajwal.csv');

// Base directory where the TypeScript files are located
const baseDir = path.join(__dirname);

// Output directory for ASTs
const outputDir = path.join(__dirname, 'AST_v2');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Function to create cluster directory if it doesn't exist
function ensureClusterDir(clusterId) {
  const clusterDir = path.join(outputDir, `cluster_${clusterId}`);
  if (!fs.existsSync(clusterDir)) {
    fs.mkdirSync(clusterDir);
  }
  return clusterDir;
}

// Function to generate AST for a TypeScript file
function generateAST(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const ast = parse(fileContent, {
      jsx: true,
      loc: true,
      range: true,
      tokens: true,
      comment: true,
      useJSXTextNode: true,
      errorOnUnknownASTType: false,
      filePath: filePath
    });
    return ast;
  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error.message);
    return null;
  }
}

// Process the CSV file
const results = [];
fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    console.log(`Processing ${results.length} files...`);
    
    // Group files by cluster
    const filesByCluster = {};
    results.forEach(row => {
      const clusterId = row.cluster_id;
      if (!filesByCluster[clusterId]) {
        filesByCluster[clusterId] = [];
      }
      filesByCluster[clusterId].push(row);
    });
    
    // Process each cluster
    Object.keys(filesByCluster).forEach(clusterId => {
      console.log(`Processing cluster ${clusterId}...`);
      const clusterDir = ensureClusterDir(clusterId);
      
      // Process each file in the cluster
      filesByCluster[clusterId].forEach(row => {
        // Get the relative file path from the CSV
        const relativeFilePath = row.filepath;
        
        // Construct the full file path
        // The CSV has paths like '/twenty/packages/...' so we need to remove the leading slash
        const normalizedPath = relativeFilePath.startsWith('/') ? relativeFilePath.substring(1) : relativeFilePath;
        const fullFilePath = path.join(baseDir, normalizedPath);
        
        // Check if file exists
        if (fs.existsSync(fullFilePath)) {
          console.log(`Generating AST for ${relativeFilePath}`);
          const ast = generateAST(fullFilePath);
          
          if (ast) {
            // Create filename for the AST file
            const fileName = path.basename(relativeFilePath, '.ts') + '.ast.json';
            const outputFilePath = path.join(clusterDir, fileName);
            
            // Save AST to file
            fs.writeFileSync(outputFilePath, JSON.stringify(ast, null, 2));
            console.log(`AST saved to ${outputFilePath}`);
          }
        } else {
          console.error(`File not found: ${fullFilePath}`);
        }
      });
    });
    
    console.log('AST generation completed!');
  });
