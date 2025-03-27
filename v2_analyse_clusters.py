import os
import json
import requests
import time
from typing import List, Dict, Any, Optional, Set, Tuple
import argparse

class ASTClusterAnalyzer:
    def __init__(self, api_key: str, model: str = "accounts/fireworks/models/deepseek-r1"):
        """
        Initialize the analyzer with Fireworks API credentials.
        
        Args:
            api_key: Fireworks.ai API key
            model: Model ID to use for analysis
        """
        self.api_key = api_key
        self.model = model
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        self.base_url = "https://api.fireworks.ai/inference/v1/completions"
        self.results = []
    
    def load_ast_files(self, cluster_dir: str, max_files: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Load AST files from a specific cluster directory.
        
        Args:
            cluster_dir: Path to the cluster directory
            max_files: Maximum number of files to load (None for all)
            
        Returns:
            List of AST objects
        """
        ast_files = []
        file_count = 0
        
        for filename in os.listdir(cluster_dir):
            if filename.endswith('.ast.json'):
                file_path = os.path.join(cluster_dir, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        ast_data = json.load(f)
                        ast_files.append({
                            'filename': filename,
                            'ast': ast_data
                        })
                        file_count += 1
                        print(f"Loaded AST from {filename}")
                        
                        if max_files is not None and file_count >= max_files:
                            break
                except Exception as e:
                    print(f"Error loading {filename}: {str(e)}")
        
        return ast_files
    
    def simplify_ast(self, ast_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Simplify AST to reduce size while preserving important structural information.
        
        Args:
            ast_data: The original AST data
            
        Returns:
            Simplified AST
        """
        # Handle None input
        if ast_data is None:
            return {}
            
        simplified = {}
        
        # Keep the type and essential properties
        if 'type' in ast_data:
            simplified['type'] = ast_data['type']
        
        # For program nodes, simplify the body
        if ast_data.get('type') == 'Program' and 'body' in ast_data:
            simplified['body'] = [self.simplify_ast(node) for node in ast_data['body']]
        
        # For declarations, keep essential info
        if ast_data.get('type') in ['FunctionDeclaration', 'ClassDeclaration', 'VariableDeclaration']:
            if 'id' in ast_data and ast_data['id'] is not None:
                simplified['name'] = ast_data['id'].get('name', 'anonymous')
            
            # For functions, summarize parameters
            if 'params' in ast_data:
                simplified['params'] = []
                for param in ast_data['params']:
                    if param is None:
                        simplified['params'].append('null_param')
                    elif isinstance(param, dict) and 'name' in param:
                        simplified['params'].append(param['name'])
                    else:
                        simplified['params'].append('complex_param')
        
        # For imports/exports
        if ast_data.get('type') in ['ImportDeclaration', 'ExportNamedDeclaration']:
            source = ast_data.get('source')
            if source is not None and isinstance(source, dict):
                simplified['moduleSpecifier'] = source.get('value', '')
            else:
                simplified['moduleSpecifier'] = ''
        
        return simplified
    
    def extract_ast_patterns(self, ast_files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extract common patterns from AST files.
        
        Args:
            ast_files: List of AST objects
            
        Returns:
            List of common patterns found
        """
        patterns = []
        
        # Count declaration types
        declaration_types = {}
        import_modules = {}
        export_types = {}
        class_methods = {}
        
        for file_data in ast_files:
            ast = file_data['ast']
            filename = file_data['filename']
            
            # Process the Program body
            if ast.get('type') == 'Program' and 'body' in ast:
                for node in ast['body']:
                    node_type = node.get('type', '')
                    
                    # Count declaration types
                    if node_type in declaration_types:
                        declaration_types[node_type] += 1
                    else:
                        declaration_types[node_type] = 1
                    
                    # Track imports
                    if node_type == 'ImportDeclaration' and 'source' in node:
                        module_name = node.get('source', {}).get('value', '')
                        if module_name:
                            if module_name in import_modules:
                                import_modules[module_name] += 1
                            else:
                                import_modules[module_name] = 1
                    
                    # Track exports
                    if node_type in ['ExportNamedDeclaration', 'ExportDefaultDeclaration']:
                        if 'declaration' in node and node['declaration']:
                            export_type = node['declaration'].get('type', '')
                            if export_type:
                                if export_type in export_types:
                                    export_types[export_type] += 1
                                else:
                                    export_types[export_type] = 1
                    
                    # Track class methods
                    if node_type == 'ClassDeclaration' and 'body' in node and 'body' in node['body']:
                        for class_item in node['body']['body']:
                            if class_item.get('type') == 'MethodDefinition':
                                method_name = class_item.get('key', {}).get('name', '')
                                if method_name:
                                    if method_name in class_methods:
                                        class_methods[method_name] += 1
                                    else:
                                        class_methods[method_name] = 1
        
        # Add patterns to the result
        if declaration_types:
            patterns.append({
                'pattern_type': 'declaration_types',
                'data': sorted(declaration_types.items(), key=lambda x: x[1], reverse=True)
            })
        
        if import_modules:
            patterns.append({
                'pattern_type': 'import_modules',
                'data': sorted(import_modules.items(), key=lambda x: x[1], reverse=True)[:10]  # Top 10
            })
        
        if export_types:
            patterns.append({
                'pattern_type': 'export_types',
                'data': sorted(export_types.items(), key=lambda x: x[1], reverse=True)
            })
        
        if class_methods:
            patterns.append({
                'pattern_type': 'class_methods',
                'data': sorted(class_methods.items(), key=lambda x: x[1], reverse=True)[:10]  # Top 10
            })
        
        return patterns
    
    def extract_service_relationships(self, ast_files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Extract relationships between services based on imports, method calls, and dependencies.
        
        Args:
            ast_files: List of AST objects
            
        Returns:
            Dictionary with service relationship data for flow chart generation
        """
        # Extract service names from filenames
        service_names = []
        for file_data in ast_files:
            filename = file_data['filename']
            # Extract service name from filename (remove .ast.json extension)
            service_name = filename.replace('.ast.json', '')
            service_names.append(service_name)
        
        # Track dependencies between services
        dependencies = []
        service_methods = {}
        service_imports = {}
        
        # First pass: collect all exported methods and classes
        for file_data in ast_files:
            filename = file_data['filename']
            service_name = filename.replace('.ast.json', '')
            ast = file_data['ast']
            
            exported_items = set()
            
            # Process the Program body to find exports
            if ast.get('type') == 'Program' and 'body' in ast:
                for node in ast['body']:
                    # Check for export declarations
                    if node.get('type') in ['ExportNamedDeclaration', 'ExportDefaultDeclaration']:
                        if node.get('declaration') and node['declaration'].get('id'):
                            exported_name = node['declaration']['id'].get('name', '')
                            if exported_name:
                                exported_items.add(exported_name)
            
            service_methods[service_name] = exported_items
        
        # Second pass: find dependencies between services
        for file_data in ast_files:
            filename = file_data['filename']
            service_name = filename.replace('.ast.json', '')
            ast = file_data['ast']
            
            imports = []
            
            # Process the Program body to find imports
            if ast.get('type') == 'Program' and 'body' in ast:
                for node in ast['body']:
                    # Check for import declarations
                    if node.get('type') == 'ImportDeclaration' and node.get('source'):
                        import_path = node['source'].get('value', '')
                        if import_path:
                            # Extract the service name from the import path
                            imported_service = self._extract_service_from_import(import_path)
                            if imported_service and imported_service in service_names and imported_service != service_name:
                                imports.append(imported_service)
                                dependencies.append((service_name, imported_service))
            
            service_imports[service_name] = imports
        
        # Find method calls between services (this is a simplified approximation)
        method_calls = []
        for file_data in ast_files:
            filename = file_data['filename']
            service_name = filename.replace('.ast.json', '')
            ast = file_data['ast']
            
            # Recursively search for method calls
            self._find_method_calls(ast, service_name, service_methods, method_calls)
        
        # Combine dependencies and method calls
        all_relationships = list(set(dependencies + method_calls))
        
        return {
            'services': service_names,
            'relationships': all_relationships,
            'service_methods': service_methods,
            'service_imports': service_imports
        }
    
    def _extract_service_from_import(self, import_path: str) -> str:
        """
        Extract service name from an import path.
        
        Args:
            import_path: Import path string
            
        Returns:
            Extracted service name or empty string
        """
        # This is a simplified implementation - customize based on your project structure
        parts = import_path.split('/')
        
        # Look for common service naming patterns
        for part in parts:
            if part.endswith('.service') or part.endswith('.controller') or part.endswith('.repository'):
                return part
            if 'service' in part or 'controller' in part or 'repository' in part:
                return part
        
        # If no service-like name found, return the last part without extension
        if parts:
            last_part = parts[-1].split('.')[0]
            return last_part
        
        return ''
    
    def _find_method_calls(self, node: Any, service_name: str, service_methods: Dict[str, Set[str]], 
                          method_calls: List[Tuple[str, str]]) -> None:
        """
        Recursively search for method calls in an AST node.
        
        Args:
            node: AST node to search
            service_name: Name of the current service
            service_methods: Dictionary mapping services to their exported methods
            method_calls: List to collect method call relationships
        """
        if node is None or not isinstance(node, dict):
            return
        
        # Check for method calls (CallExpression)
        if node.get('type') == 'CallExpression' and node.get('callee'):
            callee = node['callee']
            
            # Check for member expressions (e.g., serviceObj.method())
            if callee.get('type') == 'MemberExpression' and callee.get('object') and callee.get('property'):
                obj_name = callee['object'].get('name', '')
                method_name = callee['property'].get('name', '')
                
                # Check if this might be a call to another service
                for other_service, methods in service_methods.items():
                    if other_service != service_name and (obj_name == other_service or method_name in methods):
                        method_calls.append((service_name, other_service))
        
        # Recursively search in all properties that might contain AST nodes
        for key, value in node.items():
            if isinstance(value, dict):
                self._find_method_calls(value, service_name, service_methods, method_calls)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        self._find_method_calls(item, service_name, service_methods, method_calls)
    
    def generate_flow_chart(self, relationships_data: Dict[str, Any]) -> str:
        """
        Generate a Mermaid flow chart based on service relationships.
        
        Args:
            relationships_data: Dictionary with service relationship data
            
        Returns:
            Mermaid flow chart code as a string
        """
        services = relationships_data['services']
        relationships = relationships_data['relationships']
        
        # Start the Mermaid graph
        mermaid_code = "```mermaid\ngraph TD\n"
        
        # Add nodes for each service
        for service in services:
            # Clean service name for Mermaid compatibility
            node_id = service.replace('.', '_').replace('-', '_')
            display_name = service
            mermaid_code += f"    {node_id}[\"<b>{display_name}</b>\"]\n"
        
        # Add edges for relationships
        for source, target in relationships:
            source_id = source.replace('.', '_').replace('-', '_')
            target_id = target.replace('.', '_').replace('-', '_')
            mermaid_code += f"    {source_id} --> {target_id}\n"
        
        # Close the Mermaid code block
        mermaid_code += "```\n"
        
        return mermaid_code
    
    def categorize_cluster(self, ast_files: List[Dict[str, Any]], patterns: List[Dict[str, Any]]) -> str:
        """
        Categorize the cluster based on AST patterns.
        
        Args:
            ast_files: List of AST objects
            patterns: List of patterns extracted from ASTs
            
        Returns:
            Category string
        """
        filenames = [file_data['filename'] for file_data in ast_files]
        
        # Check for controllers
        if any(".controller." in name for name in filenames):
            return "API Controllers"
        
        # Check for services
        if any(".service." in name for name in filenames):
            return "Services"
        
        # Check for repositories
        if any(".repository." in name for name in filenames):
            return "Data Repositories"
        
        # Check for entities/models
        if any(".entity." in name or ".model." in name for name in filenames):
            return "Data Models/Entities"
        
        # Check for utilities
        if any(".util." in name or ".helper." in name for name in filenames):
            return "Utilities"
        
        # Check for migrations
        if any(name.startswith(("1", "2")) and ".ts" in name for name in filenames):
            return "Database Migrations"
        
        # Check based on patterns
        import_pattern = next((p for p in patterns if p['pattern_type'] == 'import_modules'), None)
        if import_pattern:
            imports = dict(import_pattern['data'])
            
            # Check for database-related imports
            db_imports = ['typeorm', 'sequelize', 'mongoose', 'prisma', 'knex']
            if any(db_import in imports for db_import in db_imports):
                return "Database Access Layer"
            
            # Check for GraphQL
            if any(gql_import in imports for gql_import in ['graphql', 'apollo', 'type-graphql']):
                return "GraphQL Components"
            
            # Check for messaging
            if any(msg_import in imports for msg_import in ['kafka', 'rabbitmq', 'amqp', 'redis']):
                return "Messaging Components"
        
        # Default
        return "Unspecified Components"
    
    def generate_analysis_prompt(self, ast_files: List[Dict[str, Any]], patterns: List[Dict[str, Any]], 
                                category: str, cluster_id: str, flow_chart: str) -> str:
        """
        Generate a prompt for the Fireworks.ai API to analyze ASTs.
        
        Args:
            ast_files: List of AST objects
            patterns: List of patterns extracted from ASTs
            category: Category of the cluster
            cluster_id: ID of the cluster
            flow_chart: Mermaid flow chart of service relationships
            
        Returns:
            Prompt string
        """
        filenames = [file_data['filename'] for file_data in ast_files]
        
        # Format patterns for the prompt
        patterns_text = ""
        for pattern in patterns:
            pattern_type = pattern['pattern_type']
            pattern_data = pattern['data']
            
            patterns_text += f"\n{pattern_type.replace('_', ' ').title()}:\n"
            for item, count in pattern_data[:5]:  # Limit to top 5
                patterns_text += f"- {item}: {count}\n"
        
        # Include simplified AST samples
        ast_samples = []
        for file_data in ast_files[:2]:  # Limit to 2 files for brevity
            simplified_ast = self.simplify_ast(file_data['ast'])
            ast_samples.append({
                'filename': file_data['filename'],
                'simplified_ast': simplified_ast
            })
        
        # Build the prompt
        prompt = f"""
You are an expert TypeScript code analyzer specialized in understanding Abstract Syntax Trees (ASTs) and identifying data sink services and data flow patterns.

Task: Analyze the following cluster of AST files to generate a summarized AST representation and identify data sink patterns.

Cluster ID: {cluster_id}
Cluster Category: {category}
Number of files: {len(ast_files)}

Files in this cluster:
{json.dumps(filenames, indent=2)}

AST Patterns detected:
{patterns_text}

Service Relationship Flow Chart:
{flow_chart}

Sample simplified ASTs:
{json.dumps(ast_samples, indent=2)}

Based on this information, please provide:

1. A summarized AST representation that captures the essential structure common to files in this cluster
2. What are the likely data sink services used in this cluster? (e.g., databases, message queues, APIs, file systems)
3. What specific technologies or frameworks are likely being used for data persistence? (e.g., PostgreSQL, MongoDB, Redis, Kafka)
4. What types of data are likely being stored or processed?
5. What are the main data flow patterns you can identify?
6. How do the components in this cluster interact with external systems?
7. Analyze the service relationships shown in the flow chart and explain the likely responsibilities of each service.

Provide specific technical details where possible, focusing on identifying the main data sinks and the patterns of data flow within this cluster.
"""
        return prompt
    
    def analyze_cluster(self, cluster_id: str, ast_dir: str, max_files: Optional[int] = None) -> Dict[str, Any]:
        """
        Analyze a single cluster using the Fireworks.ai API.
        
        Args:
            cluster_id: ID of the cluster to analyze
            ast_dir: Base directory containing AST files
            max_files: Maximum number of files to analyze
            
        Returns:
            Dictionary with analysis results
        """
        cluster_dir = os.path.join(ast_dir, f"cluster_{cluster_id}")
        
        if not os.path.exists(cluster_dir):
            return {
                "cluster_id": cluster_id,
                "error": f"Cluster directory {cluster_dir} does not exist"
            }
        
        # Load AST files
        ast_files = self.load_ast_files(cluster_dir, max_files)
        
        if not ast_files:
            return {
                "cluster_id": cluster_id,
                "error": f"No AST files found in {cluster_dir}"
            }
        
        # Extract patterns
        patterns = self.extract_ast_patterns(ast_files)
        
        # Extract service relationships
        relationships_data = self.extract_service_relationships(ast_files)
        
        # Generate flow chart
        flow_chart = self.generate_flow_chart(relationships_data)
        
        # Categorize cluster
        category = self.categorize_cluster(ast_files, patterns)
        
        # Generate prompt
        prompt = self.generate_analysis_prompt(ast_files, patterns, category, cluster_id, flow_chart)
        
        # Call the API
        try:
            response = requests.post(
                self.base_url,
                headers=self.headers,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "max_tokens": 2048,
                    "temperature": 0.2
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                analysis = result['choices'][0]['text']
            else:
                analysis = f"Error: {response.status_code}\n{response.text}"
        except Exception as e:
            analysis = f"Exception during API call: {str(e)}"
        
        # Return the results
        return {
            "cluster_id": cluster_id,
            "category": category,
            "analysis": analysis,
            "file_count": len(ast_files),
            "patterns": patterns,
            "flow_chart": flow_chart,
            "relationships": relationships_data,
            "file_sample": [file_data['filename'] for file_data in ast_files[:5]]  # First 5 files as sample
        }
    
    def analyze_multiple_clusters(self, cluster_ids: List[str], ast_dir: str, 
                                max_files: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Analyze multiple clusters and store the results.
        
        Args:
            cluster_ids: List of cluster IDs to analyze
            ast_dir: Base directory containing AST files
            max_files: Maximum number of files to analyze per cluster
            
        Returns:
            List of analysis results
        """
        self.results = []
        for cluster_id in cluster_ids:
            print(f"Analyzing cluster {cluster_id}...")
            result = self.analyze_cluster(cluster_id, ast_dir, max_files)
            self.results.append(result)
            # Add a delay to avoid API rate limits
            time.sleep(2)
        
        return self.results
    
    def compile_report(self, output_file: str = "ast_analysis_report.md") -> str:
        """
        Compile a comprehensive report of the analysis results.
        
        Args:
            output_file: File path to save the report
            
        Returns:
            Path to the saved report file
        """
        if not self.results:
            return "No results to compile. Run analyze_multiple_clusters first."
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# AST Cluster Analysis Report\n\n")
            f.write(f"Analysis Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("## Summary\n\n")
            f.write(f"Total Clusters Analyzed: {len(self.results)}\n\n")
            
            # Write category distribution
            categories = {}
            for result in self.results:
                category = result.get('category', 'Unknown')
                if category in categories:
                    categories[category] += 1
                else:
                    categories[category] = 1
            
            f.write("### Category Distribution\n\n")
            for category, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
                f.write(f"- {category}: {count}\n")
            
            f.write("\n## Detailed Analysis\n\n")
            
            # Write detailed analysis for each cluster
            for result in self.results:
                cluster_id = result.get('cluster_id', 'Unknown')
                category = result.get('category', 'Unknown')
                file_count = result.get('file_count', 0)
                file_sample = result.get('file_sample', [])
                analysis = result.get('analysis', '')
                flow_chart = result.get('flow_chart', '')
                
                f.write(f"### Cluster {cluster_id} ({category})\n\n")
                f.write(f"Files: {file_count}\n\n")
                
                if file_sample:
                    f.write("Sample Files:\n")
                    for file in file_sample:
                        f.write(f"- {file}\n")
                    f.write("\n")
                
                # Include the flow chart
                if flow_chart:
                    f.write("#### Service Relationship Diagram\n\n")
                    f.write(f"{flow_chart}\n")
                
                f.write("#### Analysis\n\n")
                f.write(f"{analysis}\n\n")
                
                f.write("---\n\n")
            
            f.write("\n## Conclusion\n\n")
            f.write("This report provides an analysis of AST clusters, identifying common patterns, data sinks, and data flow within each cluster.\n")
        
        print(f"Report saved to {output_file}")
        return output_file

def main():
    parser = argparse.ArgumentParser(description='Analyze AST clusters using Fireworks.ai API')
    parser.add_argument('--api-key', required=True, help='Fireworks.ai API key')
    parser.add_argument('--ast-dir', default='AST_v2', help='Directory containing AST files')
    parser.add_argument('--clusters', required=True, help='Comma-separated list of cluster IDs to analyze')
    parser.add_argument('--max-files', type=int, default=None, help='Maximum number of files to analyze per cluster')
    parser.add_argument('--output', default='ast_analysis_report.md', help='Output file for the report')
    
    args = parser.parse_args()
    
    # Create analyzer
    analyzer = ASTClusterAnalyzer(api_key=args.api_key)
    
    # Parse cluster IDs
    cluster_ids = args.clusters.split(',')
    
    # Analyze clusters
    analyzer.analyze_multiple_clusters(cluster_ids, args.ast_dir, args.max_files)
    
    # Compile report
    analyzer.compile_report(args.output)

if __name__ == '__main__':
    main()