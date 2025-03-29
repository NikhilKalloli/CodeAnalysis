const fs = require('fs').promises;
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);

// Corrected query patterns following tree-sitter syntax
const queryString = `
; Function declarations
(function_declaration
  name: (identifier) @function_name
  parameters: (formal_parameters) @function_params
  return_type: (type_annotation)? @function_return_type
  body: (statement_block) @function_body) @function

; Class declarations
(class_declaration
  name: (type_identifier) @class_name
  type_parameters: (type_parameters)? @class_generics
  body: (class_body) @class_body) @class

; Variable declarations (fixed structure)
(lexical_declaration
  (variable_declarator
    name: (identifier) @variable_name
    type: (type_annotation)? @variable_type
    value: (_) @variable_value
  )) @variable

; Function calls
(call_expression
  function: [
    (identifier) @call_name 
    (member_expression
      object: (_) @call_object
      property: (property_identifier) @call_method)
  ]
  arguments: (arguments) @call_args) @call

; Template strings
(template_string
  (template_substitution
    (_) @embedded_expression)*) @template_string

; Try-catch-finally (verified structure)
(try_statement
  body: (statement_block) @try_body
  (catch_clause
    "catch"
    parameter: (catch_formal_parameter (identifier)? @catch_param
    body: (statement_block) @catch_body)?
  (finally_clause
    body: (statement_block) @finally_body)?
) @try

; Imports (corrected specifier capture)
(import_statement
  source: (string) @import_source
  import_clause: [
    (namespace_import
      name: (identifier) @import_namespace)
    (named_imports
      (import_specifier
        name: (identifier) @import_specifier))
  ]?) @import

; Comments
(comment) @comment
`;

// Helper function to get parent chain
function getParentChain(node) {
  const chain = [];
  let current = node;
  while (current.parent) {
    chain.unshift(current.parent.type);
    current = current.parent;
  }
  return chain;
}

// Updated classifySink function with precise patterns
function classifySink(node) {
  const sinkPatterns = {
    SQL: [
      /(?:query|execute|raw)\s*\(/,
      /`SELECT.*?\${/,
      /knex\.[a-z]+\(/
    ],
    FILE: [
      /fs\.(readFile|writeFile|unlink)/,
      /require\('fs'\)/,
      /process\.std(in|out)/
    ],
    COMMAND: [
      /child_process\.(exec|spawn)/,
      /eval\(/,
      /new Function\(/
    ]
  };

  const nodeText = node.text;
  for (const [category, patterns] of Object.entries(sinkPatterns)) {
    if (patterns.some(re => re.test(nodeText))) {
      return category;
    }
  }
  return 'SAFE';
}
                  
// New helper functions
function hasSanitization(node) {
  return node.text.includes('sanitize') || 
         node.parent?.text.includes('escape');
}

function hasValidation(node) {
  return node.text.includes('validate') || 
         node.text.includes('check') ||
         node.parent?.text.includes('validate');
}

function trackDataFlow(node) {
  const sources = ['req.', 'params.', 'query.', 'body.'];
  return sources.some(s => node.text.includes(s)) ? 'USER_INPUT' : 'INTERNAL';
}

async function parseFile() {
  try {
    const filePath = '../twenty/packages/twenty-server/src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner.ts';
    const source = await fs.readFile(filePath, 'utf8');
    
    const tree = parser.parse(source);
    
    // Save full AST
    await fs.writeFile(
      './ast-tree-output.json',
      JSON.stringify(tree.rootNode, null, 2)
    );
    
    const query = new Parser.Query(TypeScript, queryString);
    const captures = query.captures(tree.rootNode);

    // Enhanced security-focused data structure
    const securityAnalysisTable = captures.map(({name, node}) => ({
      // Basic node info
      nodeType: node.type,
      captureType: name,
      
      // Location info
      location: {
        start: node.startPosition,
        end: node.endPosition,
        file: filePath
      },
      
      // Content analysis
      codeSnippet: node.text.substring(0, 100) + (node.text.length > 100 ? '...' : ''),
      contextChain: getParentChain(node),
      
      // Security classification
      securityContext: {
        isSink: classifySink(node),
        isSanitized: hasSanitization(node),
        isValidated: hasValidation(node),
        dataFlow: trackDataFlow(node)
      },
      
      // Function/Method specific
      functionMetadata: node.type === 'function_declaration' ? {
        name: node.childForFieldName('name')?.text,
        parameterCount: node.childForFieldName('parameters')?.namedChildCount,
        hasReturnType: !!node.childForFieldName('return_type')
      } : null,
      
      // Call expression specific
      callMetadata: node.type === 'call_expression' ? {
        callee: node.childForFieldName('function')?.text,
        argumentCount: node.childForFieldName('arguments')?.namedChildCount
      } : null,
      
      // Variable specific
      variableMetadata: name.includes('variable_name') ? {
        name: node.text,
        hasInitializer: !!node.parent?.childForFieldName('value'),
        isConst: node.parent?.parent?.type === 'lexical_declaration'
      } : null
    }));
    
    // Save detailed analysis
    await fs.writeFile(
      './security-analysis-output.json', 
      JSON.stringify(securityAnalysisTable, null, 2)
    );
    
    // Display summary
    console.table(securityAnalysisTable.map(entry => ({
      Type: entry.nodeType,
      Capture: entry.captureType,
      Sink: entry.securityContext.isSink,
      Location: `${entry.location.start.row}:${entry.location.start.column}`
    })));
    
    return securityAnalysisTable;
  } catch (error) {
    console.error('Error during parsing:', error.message);
    throw error;
  }
}

module.exports = { parseFile };

parseFile().catch(error => {
  console.error('Failed to parse file:', error);
  process.exit(1);
});


