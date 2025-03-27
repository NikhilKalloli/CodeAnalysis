# CodeAnalysis



``` python v2_analyse_clusters.py --api-key APIkey --clusters 1 --output ast_cluster_1_report_enhanced.md ```

JavaScript code analysis toolkit with visualization tools.

## Tools
- **Analyzers**
  - `acorn-analyzer.js`: AST analysis
  - `tree-sitter-analyzer.js`: Syntax analysis
  - `codebase-analyzer.js`: Metrics generation

- **Visualizers**
  - `json-visualizer/`: JSON data visualization
  - `visualizer/`: Code metrics visualization

## Installation

```bash
npm init -y
npm install acorn acorn-walk acorn-jsx
```

## Environment Setup

1. Clone repository:
```bash
git clone https://github.com/NikhilKalloli/CodeAnalysis
cd code-analysis-toolkit
```

2. Install dependencies:
```bash
npm install
```

## Basic Usage

```javascript
const Analyzer = require('./acorn-analyzer.js');

async function main() {
  const analyzer = new Analyzer('./src');
  await analyzer.analyzeDirectory();
  await analyzer.generateCSVReport('analysis-report.csv');
  analyzer.printSummary();
}

main();
```

## Command Line Usage

Analyze a directory and generate report:
```bash
node analyze.js --input ./src --output report.csv
```

Options:
- `--input`: Path to analyze (required)
- `--output`: Report output path (default: analysis-report.csv)
- `--verbose`: Show detailed progress

## Report Interpretation

CSV columns:
- **Category**: dataSinks/dataSources/authFlows/dataModels
- **Type**: Operation type (write_operation/read_operation/etc)
- **Context**: 3 lines of surrounding code

## Key Features
- 🔍 Automatic detection of data flows (sources/sinks)
- 🔐 Authentication flow analysis
- 🗄️ Data model extraction
- 📊 CSV report generation

## Configuration
Modify detection patterns in `acorn-analyzer.js`:
```javascript
this.patterns = {
  sinks: ['write', 'save', 'create', 'update', 'delete'],
  sources: ['get', 'find', 'fetch', 'read'],
  auth: ['jwt', 'oauth', 'auth']
};
```

## Supported File Types
- JavaScript (.js)
- TypeScript (.ts)
- JSX/TSX

## Requirements
- Node.js 16+
- npm/yarn

## Usage
```bash
npm install
node codebase-analyzer.js
```

Output: `codebase-analysis.csv`, `output.json`



1. Acorn Analyzer (acorn-analyzer.js)
Approach: Uses Acorn, a JavaScript parser with JSX support through extensions. It uses acorn-walk for AST traversal.

Pros:

Fast and lightweight parser specifically designed for JavaScript
Easy to extend with plugins (like JSX support)
Well-established in the ecosystem with good documentation
Simple visitor pattern via acorn-walk for traversing the AST
Detailed context capture for reporting with line/column info and surrounding code
Cons:

Limited to JavaScript/JSX (no TypeScript support by default)
Manual pattern matching using arrays of keywords
Less structured query syntax compared to Tree-sitter
Requires more boilerplate code for traversing complex AST structures
Not as powerful for complex language constructs
2. TypeScript ESTree Analyzer (codebase-analyzer.js)
Approach: Uses @typescript-eslint/typescript-estree as the parser, which is designed for TypeScript compatibility.

Pros:

Native TypeScript support, handles both JS and TS formats
Compatible with ESLint ecosystem
Generally robust against syntax errors
Custom tree traversal method that's more flexible than Acorn's walker
Handles modern JavaScript features well
Good for static analysis with type information
Cons:

Requires manual recursion through the AST with the traverseTree method
Simpler reporting format (doesn't include column info or context)
Uses simple string pattern matching for detection
Possibly slower than Acorn for large codebases
Less mature than Acorn but more modern
3. Tree-sitter Analyzer (tree-sitter-analyzer.js)
Approach: Uses Tree-sitter, a parser generator tool and incremental parsing library with a query language.

Pros:

Powerful query language specifically designed for code analysis
Declarative pattern matching using specialized syntax
Supports incremental parsing (efficient for real-time analysis)
Can handle syntax errors gracefully
Excellent for IDE-like features that need constant reparsing
Potentially extensible to many languages beyond JavaScript
Clean separation between query definitions and execution logic
Cons:

More complex setup with language-specific modules
Higher learning curve for the query syntax
Currently only using JavaScript language pack (would need additional modules for TypeScript)
Less widely adopted than ESLint/Acorn in the JavaScript ecosystem
Potentially higher memory usage