const fs = require('fs');
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);

// Create a simple test file
const testSource = `
function hello() {
  console.log("Hello world");
}
`;

// Parse the test file
const tree = parser.parse(testSource);

// Test each part of the query separately
const queryParts = [
  // Part 1: Function declarations
  `(function_declaration
    name: (identifier) @function_name) @function_definition`,
  
  // Part 2: Call expressions
  `(call_expression
    function: [
      (identifier) @call_func_name
      (member_expression
        object: (_) @call_object
        property: (property_identifier) @call_method_name)
    ]
    arguments: (arguments) @call_arguments) @call_expression`,
  
  // Part 3: Types - Fixed version
  `(type_annotation) @type_annotation
   (type_annotation 
     type: (type_identifier) @type_identifier_usage)`,
  
  // Part 4: Literals
  `(string) @string_literal
   (number) @number_literal`,
];

// Test each part
for (let i = 0; i < queryParts.length; i++) {
  try {
    console.log(`Testing part ${i + 1}...`);
    const query = new Parser.Query(TypeScript, queryParts[i]);
    console.log(`Part ${i + 1} is valid!`);
    
    // Test the query
    const captures = query.captures(tree.rootNode);
    console.log(`Part ${i + 1} captured ${captures.length} nodes.`);
    
  } catch (error) {
    console.error(`Error in part ${i + 1}:`, error.message);
    if (error.errorOffset !== undefined) {
      const errorPos = error.errorOffset;
      const queryPart = queryParts[i];
      console.error(`Error at position ${errorPos} in part ${i + 1}`);
      console.error(`Context: ${queryPart.substring(Math.max(0, errorPos - 20), errorPos)}[HERE]${queryPart.substring(errorPos, Math.min(queryPart.length, errorPos + 20))}`);
    }
  }
}

// Now let's try to identify the problematic section in the main query
const mainQueryPath = './google.js';
const mainQueryContent = fs.readFileSync(mainQueryPath, 'utf8');
const queryStartMarker = 'const comprehensiveQueryString = `';
const queryEndMarker = '`;';

const queryStartIndex = mainQueryContent.indexOf(queryStartMarker) + queryStartMarker.length;
const queryEndIndex = mainQueryContent.indexOf(queryEndMarker, queryStartIndex);
const fullQuery = mainQueryContent.substring(queryStartIndex, queryEndIndex);

console.log('\nAnalyzing the full query...');
console.log(`Full query length: ${fullQuery.length}`);

// Try to identify the position 1125 in the query
const position1125 = 1125;
const position1219 = 1219;
const position1493 = 1493;

// Check position 1125
if (position1125 < fullQuery.length) {
  const contextBefore = fullQuery.substring(Math.max(0, position1125 - 50), position1125);
  const errorChar = fullQuery.substring(position1125, position1125 + 1);
  const contextAfter = fullQuery.substring(position1125 + 1, Math.min(fullQuery.length, position1125 + 50));
  
  console.log(`\nContext around position 1125:`);
  console.log(`Before: "${contextBefore}"`);
  console.log(`Character at 1125: "${errorChar}"`);
  console.log(`After: "${contextAfter}"`);
}

// Check position 1219
if (position1219 < fullQuery.length) {
  const contextBefore = fullQuery.substring(Math.max(0, position1219 - 50), position1219);
  const errorChar = fullQuery.substring(position1219, position1219 + 1);
  const contextAfter = fullQuery.substring(position1219 + 1, Math.min(fullQuery.length, position1219 + 50));
  
  console.log(`\nContext around position 1219:`);
  console.log(`Before: "${contextBefore}"`);
  console.log(`Character at 1219: "${errorChar}"`);
  console.log(`After: "${contextAfter}"`);
}

// Check position 1493
if (position1493 < fullQuery.length) {
  const contextBefore = fullQuery.substring(Math.max(0, position1493 - 50), position1493);
  const errorChar = fullQuery.substring(position1493, position1493 + 1);
  const contextAfter = fullQuery.substring(position1493 + 1, Math.min(fullQuery.length, position1493 + 50));
  
  console.log(`\nContext around position 1493:`);
  console.log(`Before: "${contextBefore}"`);
  console.log(`Character at 1493: "${errorChar}"`);
  console.log(`After: "${contextAfter}"`);
}

// Try to find the section containing position 1125
let cumulativeLength = 0;
let sectionWithError = null;
let positionInSection = 0;

// Split the query into sections based on comments
const sections = [];
const sectionMarkers = fullQuery.split('; ---');
for (let i = 0; i < sectionMarkers.length; i++) {
  const section = sectionMarkers[i].trim();
  if (!section) continue;
  
  const sectionName = i === 0 ? "Start" : sectionMarkers[i-1].split('\n').pop().trim();
  sections.push({ name: sectionName, content: section });
}

// Test each section and track cumulative length
console.log('\nTesting main query sections:');
for (let i = 0; i < sections.length; i++) {
  const section = sections[i];
  const sectionContent = `; --- ${section.name} ---\n${section.content}`;
  const sectionLength = sectionContent.length;
  
  console.log(`\nSection ${i+1}: "${section.name}" (Chars ${cumulativeLength}-${cumulativeLength + sectionLength})`);
  
  // Check if this section contains position 1125
  if (cumulativeLength <= position1125 && position1125 < cumulativeLength + sectionLength) {
    sectionWithError = section;
    positionInSection = position1125 - cumulativeLength;
    console.log(`*** This section contains position 1125 (at position ${positionInSection} within this section) ***`);
    
    // Print context within this section
    const sectionContextBefore = section.content.substring(Math.max(0, positionInSection - 30), positionInSection);
    const sectionErrorChar = section.content.substring(positionInSection, positionInSection + 1);
    const sectionContextAfter = section.content.substring(positionInSection + 1, Math.min(section.content.length, positionInSection + 30));
    
    console.log(`Context in section:`);
    console.log(`Before: "${sectionContextBefore}"`);
    console.log(`Character: "${sectionErrorChar}"`);
    console.log(`After: "${sectionContextAfter}"`);
  }
  
  try {
    // Try to compile just this section
    const query = new Parser.Query(TypeScript, section.content);
    console.log(`Section is valid!`);
  } catch (error) {
    console.error(`Error in section:`, error.message);
    if (error.errorOffset !== undefined) {
      const errorPos = error.errorOffset;
      console.error(`Error at position ${errorPos} in this section`);
      console.error(`Context: ${section.content.substring(Math.max(0, errorPos - 20), errorPos)}[HERE]${section.content.substring(errorPos, Math.min(section.content.length, errorPos + 20))}`);
    }
  }
  
  cumulativeLength += sectionLength;
}
