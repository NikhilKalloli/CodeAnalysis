const fs = require('fs').promises;
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);


const comprehensiveQueryString = `
; --- Declarations ---

(function_declaration
  name: (identifier) @function_name
  parameters: (formal_parameters) @function_params
  body: (statement_block) @function_body) @function_definition

(class_declaration
  name: (type_identifier) @class_name
  body: (class_body) @class_body) @class_definition

(method_definition
  name: (property_identifier) @method_name
  parameters: (formal_parameters) @method_params
  body: (statement_block) @method_body) @method_definition

(public_field_definition
  name: (property_identifier) @class_prop_name) @class_property

(interface_declaration
  name: (type_identifier) @interface_name) @interface_definition

(type_alias_declaration
  name: (type_identifier) @type_alias_name) @type_alias_definition

(enum_declaration
  name: (identifier) @enum_name) @enum_definition

; --- Variables & Assignments ---

(lexical_declaration
  (variable_declarator
    name: (_) @variable_name)) @variable_declaration

(variable_declaration
  (variable_declarator
    name: (_) @variable_name)) @variable_declaration_legacy

(assignment_expression
  left: (_) @assign_target
  right: (_) @assign_value) @assignment

; --- Function/Method Calls ---

(call_expression
  function: (identifier) @call_func_name) @call_expression

(call_expression
  function: (member_expression
    object: (_) @call_object
    property: (property_identifier) @call_method_name)) @call_expression

; --- Imports ---

(import_statement
  source: (string) @import_source) @import_statement

; --- Exports ---

(export_statement) @export_statement

; --- Control Flow ---

(if_statement
  condition: (_) @if_condition) @if_statement

(for_statement) @for_loop
(while_statement) @while_loop

; --- Types ---

(type_annotation) @type_annotation

; --- Literals and Expressions ---

(string) @string_literal
(number) @number_literal
(true) @boolean_literal_true
(false) @boolean_literal_false
(null) @null_literal

; --- Comments ---
(comment) @comment
`;

// --- How to use it in your JavaScript code ---
async function parseFile() {
  try {
    const filePath = '../../twenty/packages/twenty-server/src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner.ts';
    const source = await fs.readFile(filePath, 'utf8');
    const tree = parser.parse(source);

    // Optional: Save full AST
    // await fs.writeFile('./ast-tree-output_test.json', JSON.stringify(tree.rootNode, null, 2));

    console.log("Compiling query...");
    const query = new Parser.Query(TypeScript, comprehensiveQueryString);
    console.log("Query compiled.");

    console.log("Running query...");
    const captures = query.captures(tree.rootNode);
    console.log(`Query captured ${captures.length} nodes.`);

    // --- IMPORTANT: Post-processing needed here ---
    // The 'resultsTable' below is still basic. You need to enhance it
    // by extracting full text, context (parents), and structure.
    const resultsTable = captures.map(({ name, node }) => {
      // **TODO:** Enhance this object with more details:
      // - node.text (full text, not truncated) for names, strings, types
      // - node.parent information (enclosing function/class)
      // - Parse complex nodes (e.g., parameters, types) into structured data
      return {
        captureType: name,
        nodeType: node.type,
        textPreview: node.text.substring(0, 60) + (node.text.length > 60 ? '...' : ''), // Keep preview for logging
        fullText: node.text, // Add full text for analysis
        startLine: node.startPosition.row + 1,
        // Add more fields based on post-processing
      };
    });

    // Save detailed results (consider a more structured format than just this list)
    await fs.writeFile(
      './query-results-enhanced.json',
      JSON.stringify(resultsTable, null, 2)
    );
    console.log("Results saved to query-results-enhanced.json");

    // Display summary (using preview)
    console.table(resultsTable.slice(0, 50).map(entry => ({ // Show first 50
      Capture: entry.captureType,
      Type: entry.nodeType,
      Line: entry.startLine,
      Preview: entry.textPreview
    })));

    return resultsTable; // Return the potentially enhanced resultsTable

  } catch (error) {
     // Keep the detailed error logging from previous examples
    console.error('Error during parsing execution:', error.message);
    const errorOffset = error?.errorOffset;
    const errorType = error?.errorType;
    if (typeof errorOffset === 'number' && typeof errorType === 'string') {
      console.error("Query Compilation Error Details:");
      console.error(`  Type: ${errorType}`);
      console.error(`  Position: ${errorOffset}`);
      if (comprehensiveQueryString && errorOffset >= 0 && errorOffset < comprehensiveQueryString.length) {
          const startPos = Math.max(0, errorOffset - 100);
          const endPos = Math.min(comprehensiveQueryString.length, errorOffset + 100);
          const beforeError = comprehensiveQueryString.substring(startPos, errorOffset);
          const errorChar = comprehensiveQueryString.substring(errorOffset, errorOffset + 1);
          const afterError = comprehensiveQueryString.substring(errorOffset + 1, endPos);
          console.error(`  Context before error:\n${beforeError}`);
          console.error(`  Error character: [${errorChar}]`);
          console.error(`  Context after error:\n${afterError}`);
      }
    } else {
      console.error('Caught non-query error during processing:', error);
    }
    throw error;
  }
}

parseFile().catch(error => {
  console.error('Failed to parse file.');
  process.exit(1);
});