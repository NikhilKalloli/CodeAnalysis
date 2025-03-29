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
  function: (identifier) @call_func_name) @call_expression_direct

(call_expression
  function: (member_expression
    object: (_) @call_object
    property: (property_identifier) @call_method_name)) @call_expression_member

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

// --- Updated function implementing Recommendations ---
async function parseFile() {
  const filePath = '../../twenty/packages/twenty-server/src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner.ts'; // Ensure path is correct relative to execution
  try {
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

    // --- AGGREGATED FEATURE EXTRACTION ---
    const fileFeatures = {
      filePath: filePath,
      featureSets: { // Using Sets to store unique names/values automatically
        functionNames: new Set(),
        classNames: new Set(),
        methodNames: new Set(), // Stores only method name, context below adds qualified name
        classPropNames: new Set(),
        interfaceNames: new Set(),
        typeAliasNames: new Set(),
        enumNames: new Set(),
        variableNames: new Set(),
        assignTargets: new Set(), // Track what's being assigned to
        callFuncNames: new Set(),
        callMethodNames: new Set(), // Method name being called
        callObjectTargets: new Set(), // Object the method is called on
        importSources: new Set(),
        stringLiterals: new Set(), // Store unique string literal content
      },
      nodeCounts: {}, // Count occurrences of specific node/capture types
      detailedCaptures: [] // Keep detailed list for potential deeper analysis later
    };

    console.log("Processing captures for aggregation...");
    for (const { name: captureType, node } of captures) {
      const fullText = node.text; // Get full text
      const nodeType = node.type;

      // Increment count for the captured node type
      fileFeatures.nodeCounts[nodeType] = (fileFeatures.nodeCounts[nodeType] || 0) + 1;
       // Increment count for the capture type itself
      fileFeatures.nodeCounts[`capture_${captureType}`] = (fileFeatures.nodeCounts[`capture_${captureType}`] || 0) + 1;


      // Find enclosing function/class context
      let enclosingFunction = null;
      let enclosingClass = null;
      let parent = node.parent;
      while (parent) {
        if (!enclosingFunction && (parent.type === 'function_declaration' || parent.type === 'method_definition')) {
          const nameNode = parent.childForFieldName('name');
          enclosingFunction = nameNode?.text || (parent.type === 'function_declaration' ? '[anonymous_func]' : '[anonymous_method]');
        } else if (!enclosingFunction && parent.type === 'arrow_function') {
            // Try to find the variable name it's assigned to
            let assignmentParent = parent.parent;
            if (assignmentParent?.type === 'variable_declarator') {
                const nameNode = assignmentParent.childForFieldName('name');
                enclosingFunction = nameNode?.text ? `${nameNode.text} (arrow)` : '[anonymous_arrow]';
            } else {
                enclosingFunction = '[anonymous_arrow]';
            }
        } else if (!enclosingClass && parent.type === 'class_declaration') {
          const nameNode = parent.childForFieldName('name');
          enclosingClass = nameNode?.text || '[anonymous_class]';
        }
        if ((enclosingFunction && enclosingClass) || !parent.parent) {
          break;
        }
        parent = parent.parent;
      }

      // Add to detailed captures list
      const detail = {
        captureType,
        nodeType,
        fullText,
        startLine: node.startPosition.row + 1,
        enclosingFunction,
        enclosingClass,
      };
      fileFeatures.detailedCaptures.push(detail);

      // --- Populate Feature Sets ---
      // Use full text for names and sources
      switch (captureType) {
        case 'function_name':
          fileFeatures.featureSets.functionNames.add(fullText);
          break;
        case 'class_name':
          fileFeatures.featureSets.classNames.add(fullText);
          break;
        case 'method_name':
          // Store qualified name if possible
          const qualifiedMethodName = enclosingClass ? `${enclosingClass}::${fullText}` : fullText;
          fileFeatures.featureSets.methodNames.add(qualifiedMethodName);
          break;
        case 'class_prop_name':
          fileFeatures.featureSets.classPropNames.add(fullText);
          break;
        case 'interface_name':
          fileFeatures.featureSets.interfaceNames.add(fullText);
          break;
        case 'type_alias_name':
          fileFeatures.featureSets.typeAliasNames.add(fullText);
          break;
        case 'enum_name':
          fileFeatures.featureSets.enumNames.add(fullText);
          break;
        case 'variable_name':
           // Variable name node might be complex (e.g., object pattern), get text directly
           fileFeatures.featureSets.variableNames.add(node.text);
          break;
        case 'assign_target':
           // Get text of the node being assigned to
           fileFeatures.featureSets.assignTargets.add(node.text);
           break;
        case 'call_func_name':
          fileFeatures.featureSets.callFuncNames.add(fullText);
          break;
         case 'call_object':
           // Get text of the object part of a member call
           fileFeatures.featureSets.callObjectTargets.add(node.text);
           break;
        case 'call_method_name':
          fileFeatures.featureSets.callMethodNames.add(fullText);
          break;
        case 'import_source':
           // Source node is string, need its content without quotes
           try {
             fileFeatures.featureSets.importSources.add(JSON.parse(fullText));
           } catch(e) {
             fileFeatures.featureSets.importSources.add(fullText); // Fallback
           }
          break;
        case 'string_literal':
           // Add string content without quotes
           try {
             fileFeatures.featureSets.stringLiterals.add(JSON.parse(fullText));
           } catch(e) {
              fileFeatures.featureSets.stringLiterals.add(fullText); // Fallback for template strings etc.
           }
          break;
        // Add cases for other literals if needed (number, boolean, null)
        // Add cases for control flow or other captures if you want to use their counts directly
      }
    }
    console.log("Aggregation complete.");

    // Convert Sets to Arrays for JSON serialization
    for (const key in fileFeatures.featureSets) {
        if (fileFeatures.featureSets[key] instanceof Set) {
            fileFeatures.featureSets[key] = Array.from(fileFeatures.featureSets[key]);
        }
    }

    // Save the aggregated features for the file
    await fs.writeFile(
      './file-features.json', // Save features for this one file
      JSON.stringify(fileFeatures, null, 2)
    );
    console.log("Aggregated file features saved to file-features.json");

    // Display summary of aggregated features (counts and some set sizes)
    console.log(`--- Aggregated Features for ${filePath} ---`);
    console.log("Feature Set Sizes:");
    for (const key in fileFeatures.featureSets) {
        console.log(`  ${key}: ${fileFeatures.featureSets[key].length}`);
    }
    console.log("\nNode/Capture Counts (Top 20):");
    console.table(Object.entries(fileFeatures.nodeCounts)
        .sort(([,a],[,b]) => b-a) // Sort descending by count
        .slice(0, 20) // Take top 20
        .reduce((obj, [key, value]) => { obj[key] = value; return obj; }, {})
    );


    return fileFeatures; // Return the aggregated features object

  } catch (error) {
     // Keep the detailed error logging
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