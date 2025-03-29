const fs = require('fs').promises;
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');
const path = require('path');

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
// New utility functions =======================================================

function getEnclosingContext(node) {
  const context = [];
  let currentNode = node;
  
  while (currentNode.parent) {
    const parent = currentNode.parent;
    if (parent.type === 'class_declaration') {
      const nameNode = parent.childForFieldName('name');
      if (nameNode) context.push(`class:${nameNode.text}`);
    } else if (parent.type === 'function_declaration') {
      const nameNode = parent.childForFieldName('name');
      if (nameNode) context.push(`function:${nameNode.text}`);
    } else if (parent.type === 'method_definition') {
      const nameNode = parent.childForFieldName('name');
      if (nameNode) context.push(`method:${nameNode.text}`);
    }
    currentNode = parent;
  }
  
  return context.reverse().join(' → ');
}

function analyzeCrossFileReferences(importSources, currentFilePath) {
  const references = {
    internal: new Set(),
    external: new Set()
  };

  importSources.forEach(source => {
    const cleanSource = source.replace(/['"]/g, '');
    if (cleanSource.startsWith('.') || cleanSource.startsWith('/')) {
      const resolvedPath = path.resolve(path.dirname(currentFilePath), cleanSource);
      references.internal.add(resolvedPath);
    } else {
      references.external.add(cleanSource);
    }
  });

  return references;
}

function calculateSimilarity(fileA, fileB) {
  // Jaccard similarity for different feature sets
  const jaccard = (setA, setB) => {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return intersection.size / (setA.size + setB.size - intersection.size) || 0;
  };

  return {
    imports: jaccard(fileA.imports, fileB.imports),
    classes: jaccard(fileA.classes, fileB.classes),
    methods: jaccard(fileA.methods, fileB.methods),
    calls: jaccard(fileA.calls, fileB.calls),
    combined: (
      0.4 * jaccard(fileA.imports, fileB.imports) +
      0.3 * jaccard(fileA.classes, fileB.classes) +
      0.2 * jaccard(fileA.methods, fileB.methods) +
      0.1 * jaccard(fileA.calls, fileB.calls)
    )
  };
}

// Enhanced parser implementation ==============================================

async function parseFile() {
  try {
    const filePath = '../../twenty/packages/twenty-server/src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner.ts';
    const source = await fs.readFile(filePath, 'utf8');
    const tree = parser.parse(source);

    const query = new Parser.Query(TypeScript, comprehensiveQueryString);
    const captures = query.captures(tree.rootNode);

    // Enhanced processing pipeline ============================================
    const fileFeatures = {
      path: filePath,
      imports: new Set(),
      exports: new Set(),
      classes: new Set(),
      methods: new Set(),
      variables: new Set(),
      calls: new Set(),
      decorators: new Set(),
      contextMap: new Map()
    };

    const enhancedResults = captures.map(({ name, node }) => {
      // Capture full context for each node
      const entry = {
        captureType: name,
        nodeType: node.type,
        text: node.text,
        startLine: node.startPosition.row + 1,
        context: getEnclosingContext(node)
      };

      // Populate file features
      switch(name) {
        case 'import_source':
          fileFeatures.imports.add(node.text.replace(/['"]/g, ''));
          break;
        case 'class_name':
          fileFeatures.classes.add(node.text);
          break;
        case 'method_name':
          fileFeatures.methods.add(node.text);
          break;
        case 'call_func_name':
        case 'call_method_name':
          fileFeatures.calls.add(node.text);
          break;
      }

      return entry;
    });

    // Cross-file analysis =====================================================
    const crossFileRefs = analyzeCrossFileReferences(
      [...fileFeatures.imports],
      filePath
    );

    // If analyzing multiple files, this would be in a loop
    const allFiles = [{
      ...fileFeatures,
      internalDeps: crossFileRefs.internal,
      externalDeps: crossFileRefs.external
    }];

    // Similarity calculation (example with dummy data)
    const similarityMatrix = calculateSimilarity(allFiles[0], {
      imports: new Set(['some_shared_import']),
      classes: new Set(),
      methods: new Set(),
      calls: new Set()
    });

    // Graph construction ======================================================
    const codeGraph = {
      nodes: allFiles.map(file => ({
        id: file.path,
        imports: file.imports.size,
        classes: file.classes.size,
        methods: file.methods.size
      })),
      edges: [{
        source: filePath,
        target: 'some_other_file.ts',
        weight: similarityMatrix.combined,
        metrics: similarityMatrix
      }]
    };

    // Save enhanced outputs
    await fs.writeFile(
      './enhanced-analysis.json',
      JSON.stringify({
        captures: enhancedResults,
        fileFeatures,
        crossFileRefs: [...crossFileRefs.internal],
        codeGraph
      }, null, 2)
    );

    console.log('Analysis complete. Graph nodes:', codeGraph.nodes);
    return codeGraph;

  } catch (error) {
    // [Keep original error handling unchanged]
  }
}

parseFile().catch(error => {
  console.error('Failed to parse file.');
  process.exit(1);
});