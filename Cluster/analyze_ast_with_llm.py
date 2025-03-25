import json
import os
import re
import logging
import requests
from typing import Dict, Any, List

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def parse_typescript_to_ast(content: str) -> Dict[str, Any]:
    """
    Parse TypeScript content into a simplified AST structure.
    """
    ast = {
        "type": "Program",
        "body": []
    }
    
    # Split content into lines for analysis
    lines = content.split('\n')
    current_node = None
    
    for line in lines:
        line = line.strip()
        
        # Skip empty lines
        if not line:
            continue
            
        # Detect imports
        if line.startswith('import'):
            node = {
                "type": "ImportDeclaration",
                "text": line,
                "source": re.findall(r'from\s+[\'"](.+?)[\'"]', line)
            }
            ast["body"].append(node)
            
        # Detect class declarations
        elif line.startswith('class'):
            class_name = re.findall(r'class\s+(\w+)', line)
            node = {
                "type": "ClassDeclaration",
                "name": class_name[0] if class_name else "Unknown",
                "text": line,
                "methods": [],
                "properties": []
            }
            current_node = node
            ast["body"].append(node)
            
        # Detect methods within classes
        elif re.match(r'\s*\w+\([^)]*\)', line) and current_node and current_node["type"] == "ClassDeclaration":
            method_name = re.findall(r'(\w+)\s*\(', line)
            node = {
                "type": "MethodDeclaration",
                "name": method_name[0] if method_name else "Unknown",
                "text": line,
                "isAsync": "async" in line
            }
            current_node["methods"].append(node)
            
        # Detect decorators
        elif line.startswith('@'):
            node = {
                "type": "Decorator",
                "text": line
            }
            ast["body"].append(node)
    
    return ast

def analyze_ast_with_llm(ast: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    """
    Send the AST to Fireworks.ai API for analysis.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Create a detailed prompt for the LLM
    prompt = f"""
You are an expert code analyzer specialized in identifying data sink services and data flow patterns in TypeScript applications.

Analyze the following TypeScript AST structure and identify:
1. Data sink services (databases, message queues, file systems, etc.)
2. Data flow patterns
3. Potential security concerns
4. Architecture patterns

AST Structure:
{json.dumps(ast, indent=2)}

Focus your analysis on:
- How data moves through the system
- Where data is stored or persisted
- Security implications of the data handling
- Architectural patterns present in the code

Provide a detailed technical analysis with specific examples from the AST.
"""

    try:
        response = requests.post(
            "https://api.fireworks.ai/inference/v1/completions",
            headers=headers,
            json={
                "model": "accounts/fireworks/models/mixtral-8x7b-instruct",
                "prompt": prompt,
                "max_tokens": 1024,
                "temperature": 0.2
            }
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"API request failed: {response.status_code}")
            logger.error(response.text)
            return None
            
    except Exception as e:
        logger.error(f"Failed to analyze with LLM: {str(e)}")
        return None

def main():
    # Read c0.txt
    try:
        with open('c0.txt', 'r', encoding='utf-8') as f:
            content = f.read()
            logger.info("Successfully read c0.txt")
    except Exception as e:
        logger.error(f"Failed to read c0.txt: {str(e)}")
        return
    
    # Parse to AST
    logger.info("Parsing TypeScript to AST...")
    ast = parse_typescript_to_ast(content)
    
    # Save AST for inspection
    with open('typescript_ast.json', 'w', encoding='utf-8') as f:
        json.dump(ast, f, indent=2)
    logger.info("Saved AST to typescript_ast.json")
    
    # Get API key
    api_key = os.environ.get("FIREWORKS_API_KEY", "LMAO")
    
    # Analyze with LLM
    logger.info("Sending AST to LLM for analysis...")
    analysis = analyze_ast_with_llm(ast, api_key)
    
    if analysis:
        # Save the analysis
        with open('ast_analysis.json', 'w', encoding='utf-8') as f:
            json.dump(analysis, f, indent=2)
        logger.info("Saved analysis to ast_analysis.json")
        
        # Print the analysis
        if 'choices' in analysis and analysis['choices']:
            print("\nAnalysis Results:")
            print("=" * 50)
            print(analysis['choices'][0]['text'])
            print("=" * 50)
    else:
        logger.error("Failed to get analysis from LLM")

if __name__ == "__main__":
    main() 