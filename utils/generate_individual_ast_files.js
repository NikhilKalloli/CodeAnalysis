const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Configuration
const FILEPATHS_FILE = 'filepaths.txt';
const BASE_DIR = './twenty'; // The base directory containing the source files
const AST_OUTPUT_DIR = './AST'; // Output directory for AST text files
const FILENAME_MAP = new Map(); // Track filename occurrences for collision handling

/**
 * Extract all node types from an AST tree
 * @param {ts.Node} node - The TypeScript AST node
 * @returns {string[]} - Array of node kind names
 */
function extractNodeTypes(node) {
  const nodeTypes = [];
  const syntaxKindNames = {};
  
  // Get all SyntaxKind name mappings
  for (const key in ts.SyntaxKind) {
    if (isNaN(Number(key))) {
      syntaxKindNames[ts.SyntaxKind[key]] = key;
    }
  }

  // Traverse the AST and collect node types
  function visit(node) {
    // Get the name of the node kind
    const kindName = syntaxKindNames[node.kind];
    if (kindName) {
      nodeTypes.push(kindName);
    }
    
    // Visit all children
    ts.forEachChild(node, visit);
  }
  
  visit(node);
  return nodeTypes;
}

/**
 * Generate a unique filename for the output
 * @param {string} originalFilePath - The original file path
 * @returns {string} - A unique filename
 */
function generateUniqueFilename(originalFilePath) {
  // Extract just the filename part 
  const baseName = path.basename(originalFilePath);
  
  // Check if this filename has been used already
  if (FILENAME_MAP.has(baseName)) {
    // Increment the count for this filename
    const count = FILENAME_MAP.get(baseName) + 1;
    FILENAME_MAP.set(baseName, count);
    // Add a number to make it unique
    return `${baseName}${count}`;
  } else {
    // First occurrence of this filename
    FILENAME_MAP.set(baseName, 1);
    return baseName;
  }
}

/**
 * Process a TypeScript file and return the node types
 * @param {string} filePath - Path to the TypeScript file
 * @returns {Object} - Object containing success status and node types
 */
function processFile(filePath) {
  try {
    // Read the source file
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    
    // Parse the source file into an AST
    const sourceFile = ts.createSourceFile(
      path.basename(filePath),
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );
    
    // Extract node types
    const nodeTypes = extractNodeTypes(sourceFile);
    
    return {
      success: true,
      nodeTypes: nodeTypes.join(' ')
    };
  } catch (error) {
    console.error(`Error processing file ${filePath}: ${error.message}`);
    return {
      success: false,
      nodeTypes: ''
    };
  }
}

/**
 * Process all filepaths and generate AST node type strings in individual files
 */
function processFilepaths() {
  if (!fs.existsSync(FILEPATHS_FILE)) {
    console.error(`Error: ${FILEPATHS_FILE} not found.`);
    return false;
  }
  
  // Create AST output directory if it doesn't exist
  if (!fs.existsSync(AST_OUTPUT_DIR)) {
    fs.mkdirSync(AST_OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${AST_OUTPUT_DIR}`);
  }
  
  // Read the filepaths file
  const filepaths = fs.readFileSync(FILEPATHS_FILE, 'utf8').split('\n').filter(Boolean);
  console.log(`Found ${filepaths.length} filepaths to process.`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const filepath of filepaths) {
    // Convert the relative path to an absolute path
    const absolutePath = path.resolve(BASE_DIR, filepath.replace(/^\/twenty\//, ''));
    
    // Generate unique filename for this file
    const uniqueFilename = generateUniqueFilename(filepath);
    
    // Create output path
    const outputPath = path.join(AST_OUTPUT_DIR, uniqueFilename + '.txt');
    
    // Check if the source file exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found: ${absolutePath}`);
      failCount++;
      continue;
    }
    
    // Process the file
    const result = processFile(absolutePath);
    
    if (result.success) {
      // Write to individual output file
      fs.writeFileSync(outputPath, result.nodeTypes, 'utf8');
      successCount++;
    } else {
      failCount++;
    }
    
    // Progress indicator
    if ((successCount + failCount) % 50 === 0) {
      console.log(`Progress: ${successCount + failCount}/${filepaths.length} files processed.`);
    }
  }
  
  console.log(`
AST Node Types Extraction Complete
=================================
Total files: ${filepaths.length}
Successfully processed: ${successCount}
Failed: ${failCount}
AST files saved to: ${AST_OUTPUT_DIR}
  `);
  
  return successCount > 0;
}

// Execute the script
const success = processFilepaths();

if (success) {
  console.log('AST node types extraction completed successfully!');
} else {
  console.log('AST node types extraction failed.');
} 