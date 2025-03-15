const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const ts = require('typescript');

class ASTPrinter {
    constructor() {
        this.parser = acorn.Parser.extend(jsx());
    }

    printAST(ast, depth = 0, maxDepth = 3) {
        if (depth > maxDepth) return '...';
        
        if (Array.isArray(ast)) {
            return ast.map(node => this.printAST(node, depth, maxDepth));
        }
        
        if (ast && typeof ast === 'object') {
            const obj = {};
            for (const [key, value] of Object.entries(ast)) {
                // Skip location info and parent references to keep output clean
                if (key !== 'loc' && key !== 'range' && key !== 'parent' && key !== 'sourceFile') {
                    obj[key] = this.printAST(value, depth + 1, maxDepth);
                }
            }
            return obj;
        }
        
        return ast;
    }

    generateAST(filePath, maxDepth = 3) {
        try {
            console.log(`\nGenerating AST for: ${filePath}`);
            const content = fs.readFileSync(filePath, 'utf8');
            let ast;

            // Handle TypeScript files
            if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                const result = ts.transpileModule(content, {
                    compilerOptions: {
                        target: ts.ScriptTarget.ESNext,
                        module: ts.ModuleKind.CommonJS,
                        jsx: ts.JsxEmit.Preserve,
                        experimentalDecorators: true,
                        emitDecoratorMetadata: true
                    }
                });
                
                ast = this.parser.parse(result.outputText, {
                    sourceType: 'module',
                    ecmaVersion: 'latest',
                    locations: true
                });
            } else {
                ast = this.parser.parse(content, {
                    sourceType: 'module',
                    ecmaVersion: 'latest',
                    locations: true
                });
            }

            // Create output directory if it doesn't exist
            if (!fs.existsSync('print_ast_output')) {
                fs.mkdirSync('print_ast_output');
            }

            // Print AST
            const simplifiedAST = this.printAST(ast, 0, maxDepth);
            
            // Save to file
            const fileName = path.basename(filePath, path.extname(filePath));
            const outputPath = path.join('print_ast_output', `${fileName}_ast.json`);
            fs.writeFileSync(outputPath, JSON.stringify(simplifiedAST, null, 2));

            console.log(`AST saved to: ${outputPath}`);
            return simplifiedAST;

        } catch (error) {
            console.error(`Error generating AST: ${error.message}`);
            return null;
        }
    }
}

// CLI interface
if (require.main === module) {
    if (process.argv.length < 3) {
        console.error('Please provide a file path');
        console.error('Usage: node print_ast.js <file_path> [depth]');
        process.exit(1);
    }

    const filePath = process.argv[2];
    const depth = parseInt(process.argv[3]) || 3;
    
    const printer = new ASTPrinter();
    const ast = printer.generateAST(filePath, depth);
    
    if (ast) {
        console.log('\nAbstract Syntax Tree (simplified):');
        console.log('================================');
        console.log(JSON.stringify(ast, null, 2));
    }
}

module.exports = ASTPrinter; 