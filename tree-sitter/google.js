const fs = require('fs').promises;
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);


const comprehensiveQueryString = `
; --- Declarations ---

(function_declaration
  ("async")? @func_async
  name: (identifier) @function_name
  parameters: (formal_parameters) @function_params
  return_type: (_)? @function_return_type
  body: (statement_block) @function_body) @function_definition

(generator_function_declaration
  ("async")? @func_async
  name: (identifier) @function_name
  parameters: (formal_parameters) @function_params
  return_type: (_)? @function_return_type
  body: (statement_block) @function_body) @generator_function_definition

(class_declaration
  (decorator)* @decorator_on_class
  name: (type_identifier) @class_name
  (extends_clause . (_) @class_extends)? @class_heritage
  (implements_clause . (_) @class_implements)?
  body: (class_body) @class_body) @class_definition

(abstract_class_declaration
  (decorator)* @decorator_on_class
  name: (type_identifier) @class_name
  (extends_clause . (_) @class_extends)? @class_heritage
  (implements_clause . (_) @class_implements)?
  body: (class_body) @class_body) @abstract_class_definition

; Methods within classes
(method_definition
   (decorator)* @decorator_on_method
   accessibility_modifier? @method_modifier
   static? @method_static
   (override_modifier)? @method_override
   ("async")? @method_async
   name: (property_identifier) @method_name
   parameters: (formal_parameters) @method_params
   return_type: (_)? @method_return_type
   body: (statement_block) @method_body) @method_definition

; Class Properties
(public_field_definition
  (decorator)* @decorator_on_prop
  accessibility_modifier? @prop_modifier
  static? @prop_static
  (override_modifier)? @prop_override
  readonly? @prop_readonly
  name: (property_identifier) @class_prop_name
  type: (_)? @class_prop_type
  value: (_)? @class_prop_value) @class_property

; Interfaces
(interface_declaration
  name: (type_identifier) @interface_name
  body: (object_type) @interface_body) @interface_definition

; Type Aliases
(type_alias_declaration
  name: (type_identifier) @type_alias_name
  value: (_) @type_alias_value) @type_alias_definition

; Enums
(enum_declaration
  name: (identifier) @enum_name
  body: (enum_body) @enum_body) @enum_definition


; --- Variables & Assignments ---

(lexical_declaration
  kind: _ @variable_kind
  (variable_declarator
    name: (_) @variable_name
    type: (_)? @variable_type
    value: (_)? @variable_value)) @variable_declaration

(variable_declaration
  kind: "var" @variable_kind
  (variable_declarator
    name: (_) @variable_name
    value: (_)? @variable_value)) @variable_declaration_legacy

(assignment_expression
  left: (_) @assign_target
  operator: _ @assign_operator
  right: (_) @assign_value) @assignment

(augmented_assignment_expression
  left: (_) @aug_assign_target
  operator: _ @aug_assign_operator
  right: (_) @aug_assign_value) @augmented_assignment


; --- Function/Method Calls ---

(call_expression
  function: [
    (identifier) @call_func_name
    (member_expression
      object: (_) @call_object
      property: (property_identifier) @call_method_name)
    (super) @call_super
  ]
  arguments: (arguments (_)* @call_argument) @call_arguments
  type_arguments: (_)? @call_type_args) @call_expression


; --- Imports ---

(import_statement
  source: (string) @import_source
  (import_clause)? @import_clause) @import_statement

(import_clause 
  (identifier) @import_default_name)

(import_clause
  (named_imports
    (import_specifier
      name: (identifier) @import_specifier_name
      alias: (identifier)? @import_specifier_alias))) @named_imports

(import_clause
  (namespace_import 
    (identifier) @import_namespace_name))


; --- Exports ---

(export_statement
  declaration: (_) @exported_declaration) @export_declaration_statement

(export_statement
  (export_clause 
    (export_specifier 
      name: (identifier) @exported_name 
      alias: (identifier)? @exported_alias))
  source: (string)? @export_source) @export_named_statement

(export_statement
  (namespace_export 
    (identifier)? @export_namespace_alias)
  source: (string) @export_source) @export_all_statement

(export_statement
  value: (_) @export_default_value) @export_default_statement


; --- Control Flow ---

(if_statement
  condition: (_) @if_condition
  consequence: (_) @if_consequence
  alternative: (else_clause)? @if_alternative) @if_statement

(switch_statement
  value: (_) @switch_value
  body: (switch_body) @switch_body) @switch_statement

(for_statement) @for_loop
(for_in_statement) @for_in_loop
(while_statement) @while_loop
(do_statement) @do_while_loop

(try_statement
  body: (statement_block) @try_body
  (catch_clause
    parameter: (_)? @catch_parameter
    body: (statement_block) @catch_body)? @catch_clause
  (finally_clause
    body: (statement_block) @finally_body)?) @try_statement


; --- Decorators ---

(decorator 
  expression: (_) @decorator_expression) @decorator_node


; --- Types ---

(type_annotation) @type_annotation

(type_annotation 
  type: (type_identifier) @type_identifier_usage)
(type_annotation 
  type: (predefined_type) @predefined_type_usage)
(type_annotation 
  type: (union_type) @union_type_usage)
(type_annotation 
  type: (intersection_type) @intersection_type_usage)
(type_annotation 
  type: (array_type) @array_type_usage)
(type_annotation 
  type: (generic_type) @generic_type_usage)


; --- Literals and Expressions ---

(template_string) @template_string
(string) @string_literal
(number) @number_literal
(regex) @regex_literal
(true) @boolean_literal_true
(false) @boolean_literal_false
(null) @null_literal
(object) @object_literal
(array) @array_literal

(binary_expression 
  operator: _ @binary_operator) @binary_expression
(unary_expression 
  operator: _ @unary_operator) @unary_expression
(ternary_expression) @ternary_expression
(await_expression) @await_expression
(yield_expression) @yield_expression


; --- Comments ---
(comment) @comment

; --- JSX (Optional, if relevant) ---
; (jsx_element) @jsx_element
; (jsx_attribute) @jsx_attribute
; (jsx_expression) @jsx_expression

`;

// --- How to use it in your JavaScript code ---
async function parseFile() {
  try {
    const filePath = '../twenty/packages/twenty-server/src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner.ts';
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
          const contextBefore = comprehensiveQueryString.substring(Math.max(0, errorOffset - 40), errorOffset);
          const errorChar = comprehensiveQueryString.substring(errorOffset, errorOffset + 1);
          const contextAfter = comprehensiveQueryString.substring(errorOffset + 1, Math.min(comprehensiveQueryString.length, errorOffset + 40));
          console.error(`  Context:\n...${contextBefore}[${errorChar}]${contextAfter}...`);
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