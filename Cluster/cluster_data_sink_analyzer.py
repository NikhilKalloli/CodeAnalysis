import requests
import json
import os
import time
from typing import List, Dict, Any

class ClusterDataSinkAnalyzer:
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
        self.results = []
    
    def generate_cluster_prompt(self, cluster_data: Dict[str, Any]) -> str:
        """
        Generate a targeted prompt for a specific cluster.
        
        Args:
            cluster_data: Dictionary containing cluster information
            
        Returns:
            Prompt string for the Fireworks.ai API
        """
        cluster_id = cluster_data.get("cluster_id")
        file_paths = cluster_data.get("file_paths", [])
        num_files = cluster_data.get("num_files", len(file_paths))
        file_samples = file_paths[:5]  # Limit to 5 examples for readability
        
        # Extract AST features or patterns if available
        ast_patterns = cluster_data.get("ast_patterns", [])
        top_features = cluster_data.get("top_features", "")
        
        # Attempt to categorize the cluster based on file names and features
        cluster_category = self._categorize_cluster(file_paths, top_features)
        
        # Create the prompt text parts
        top_features_text = f"Top AST features in this cluster:\n{top_features}" if top_features else ""
        
        ast_patterns_text = ""
        if ast_patterns:
            ast_patterns_text = f"AST patterns found in this cluster:\n{json.dumps(ast_patterns[:3], indent=2)}"
        
        # Build the prompt string using normal string concatenation for parts with potential issues
        prompt = f"""
You are an expert code analyzer specialized in identifying data sink services and data flow patterns in TypeScript/JavaScript applications.

Task: Analyze the following cluster of files to identify common data sink services and data flow patterns.

Cluster ID: {cluster_id}
Cluster Category: {cluster_category}
Number of files: {num_files}

Sample files in this cluster:
{json.dumps(file_samples, indent=2)}

{top_features_text}
{ast_patterns_text}

Based on this information, please provide a comprehensive analysis with the following:

1. What are the likely data sink services used in this cluster? (e.g., databases, message queues, APIs, file systems)
2. What specific technologies or frameworks are likely being used for data persistence? (e.g., PostgreSQL, MongoDB, Redis, Kafka)
3. What types of data are likely being stored or processed?
4. What are the main data flow patterns you can identify?
5. Are there any potential security concerns with how data is being handled?
6. How do the components in this cluster interact with external systems?

Provide specific technical details where possible, focusing on identifying the main data sinks and the patterns of data flow within this cluster.
"""
        return prompt
    
    def _categorize_cluster(self, file_paths: List[str], top_features: str) -> str:
        """
        Attempt to categorize a cluster based on file names and features.
        
        Args:
            file_paths: List of file paths in the cluster
            top_features: String describing top AST features
            
        Returns:
            Category string
        """
        file_names = [os.path.basename(path) for path in file_paths]
        
        # Check for migrations
        if any(name.startswith(("1", "2")) and ".ts" in name for name in file_names):
            return "Database Migrations"
        
        # Check for controllers
        if any(".controller." in name for name in file_names):
            return "API Controllers"
        
        # Check for services
        if any(".service." in name for name in file_names):
            return "Services"
        
        # Check for repositories
        if any(".repository." in name for name in file_names):
            return "Data Repositories"
        
        # Check for models
        if any(".model." in name or ".entity." in name for name in file_names):
            return "Data Models/Entities"
        
        # Check for utilities
        if any(".util." in name or ".helper." in name for name in file_names):
            return "Utilities"
            
        # Default
        return "Unspecified Components"
    
    def analyze_cluster(self, cluster_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze a single cluster using the Fireworks.ai API.
        
        Args:
            cluster_data: Dictionary containing cluster information
            
        Returns:
            Dictionary with analysis results
        """
        # Generate the prompt
        prompt = self.generate_cluster_prompt(cluster_data)
        
        # Call the API
        try:
            response = requests.post(
                "https://api.fireworks.ai/inference/v1/completions",
                headers=self.headers,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "max_tokens": 1024,
                    "temperature": 0.2
                },
                timeout=30
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
            "cluster_id": cluster_data.get("cluster_id"),
            "category": self._categorize_cluster(
                cluster_data.get("file_paths", []), 
                cluster_data.get("top_features", "")
            ),
            "analysis": analysis,
            "file_count": cluster_data.get("num_files", len(cluster_data.get("file_paths", []))),
            "file_sample": cluster_data.get("file_paths", [])[:5]  # First 5 files as sample
        }
    
    def analyze_all_clusters(self, clusters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyze all clusters and store the results.
        
        Args:
            clusters: List of cluster data dictionaries
            
        Returns:
            List of analysis results
        """
        self.results = []
        for cluster in clusters:
            print(f"Analyzing cluster {cluster.get('cluster_id')}...")
            result = self.analyze_cluster(cluster)
            self.results.append(result)
            # Add a delay to avoid API rate limits
            time.sleep(1)
        
        return self.results
    
    def compile_report(self, output_file: str = "data_sink_analysis_report.md") -> str:
        """
        Compile a comprehensive report of the analysis results.
        
        Args:
            output_file: File path to save the report
            
        Returns:
            Path to the saved report file
        """
        if not self.results:
            return "No results to compile. Run analyze_all_clusters first."
        
        # Sort results by cluster ID
        sorted_results = sorted(self.results, key=lambda x: x.get("cluster_id", 0))
        
        # Generate the report
        report = "# Data Sink Services Analysis Report\n\n"
        report += f"Analysis Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
        report += f"Total Clusters Analyzed: {len(sorted_results)}\n\n"
        
        # Add summary table
        report += "## Summary of Clusters\n\n"
        report += "| Cluster ID | Category | File Count |\n"
        report += "|------------|----------|------------|\n"
        
        for result in sorted_results:
            cluster_id = result.get("cluster_id", "N/A")
            category = result.get("category", "Uncategorized")
            file_count = result.get("file_count", 0)
            report += f"| {cluster_id} | {category} | {file_count} |\n"
        
        report += "\n## Detailed Analysis by Cluster\n\n"
        
        # Add detailed analysis for each cluster
        for result in sorted_results:
            cluster_id = result.get("cluster_id", "N/A")
            category = result.get("category", "Uncategorized")
            file_count = result.get("file_count", 0)
            file_sample = result.get("file_sample", [])
            analysis = result.get("analysis", "No analysis available")
            
            report += f"### Cluster {cluster_id} ({category})\n\n"
            report += f"**File Count:** {file_count}\n\n"
            report += "**Sample Files:**\n\n"
            
            for file in file_sample:
                report += f"- `{file}`\n"
            
            report += "\n**Analysis:**\n\n"
            report += analysis.strip() + "\n\n"
            report += "---\n\n"
        
        # Add cross-cluster insights
        report += "## Cross-Cluster Insights\n\n"
        report += "This section would typically contain insights derived from analyzing patterns across clusters.\n"
        report += "For a complete cross-cluster analysis, a second pass with the Fireworks.ai API would be required,\n"
        report += "where the results from individual clusters are summarized and analyzed together.\n\n"
        
        # Save the report with UTF-8 encoding
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(report)
        
        return output_file 