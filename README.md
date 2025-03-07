# CodeAnalysis

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