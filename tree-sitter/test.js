const fs = require('fs').promises;
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);

// Fixed query patterns with proper Tree-sitter syntax
const queryString = `
; Function declarations
(function_declaration
  name: (identifier) @function_name
  parameters: (formal_parameters) @function_params
  body: (statement_block) @function_body) @function

; Class declarations
(class_declaration
  name: (type_identifier) @class_name
  body: (class_body) @class_body) @class

; Variable declarations
(lexical_declaration
  (variable_declarator
    name: (identifier) @variable_name)) @variable

; Function calls
(call_expression
  function: [
    (identifier) @call_name 
    (member_expression
      property: (property_identifier) @call_method)
  ]
  arguments: (arguments) @call_args) @call

; Template strings
(template_string) @template_string

; Try-catch blocks
(try_statement
  body: (statement_block) @try_body
  (catch_clause
    body: (statement_block) @catch_body)?) @try

; Imports
(import_statement
  source: (string) @import_source) @import

; Comments
(comment) @comment
`;

async function parseFile() {
  try {
    const filePath = '../twenty/packages/twenty-server/src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner.ts';
    const source = await fs.readFile(filePath, 'utf8');
    
    const tree = parser.parse(source);
    
    // Save full AST
    await fs.writeFile(
      './ast-tree-output_test.json',
      JSON.stringify(tree.rootNode, null, 2)
    );
    
    const query = new Parser.Query(TypeScript, queryString);
    const captures = query.captures(tree.rootNode);

    // Create a simple flattened table of results
    const resultsTable = captures.map(({name, node}) => ({
      nodeType: node.type,
      captureType: name,
      text: node.text.substring(0, 40) + (node.text.length > 40 ? '...' : '')
    }));
    
    // Save results
    await fs.writeFile(
      './query-results.json', 
      JSON.stringify(resultsTable, null, 2)
    );
    
    // Display summary
    console.table(resultsTable.map(entry => ({
      Type: entry.nodeType,
      Capture: entry.captureType,
      Preview: entry.text.substring(0, 30) + '...'
    })));
    
    return resultsTable;
  } catch (error) {
    console.error('Error during parsing:', error.message);
    throw error;
  }
}

parseFile().catch(error => {
  console.error('Failed to parse file:', error);
  process.exit(1);
});