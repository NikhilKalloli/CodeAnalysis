import json
import os
from cluster_data_sink_analyzer import ClusterDataSinkAnalyzer

# You should set this as an environment variable in production
FIREWORKS_API_KEY = "YOUR_FIREWORKS_API_KEY"  

def load_cluster_data(file_path):
    """Load cluster data from a JSON file."""
    with open(file_path, 'r') as f:
        return json.load(f)

def main():
    # Check if API key is provided
    if FIREWORKS_API_KEY == "YOUR_FIREWORKS_API_KEY":
        print("Please set your Fireworks API key in the script or as an environment variable.")
        return
    
    # Create the analyzer
    analyzer = ClusterDataSinkAnalyzer(api_key=FIREWORKS_API_KEY)
    
    # Sample cluster data - in practice, this would come from your AST analysis
    clusters = [
        {
            "cluster_id": -1,
            "file_paths": [
                "/content/drive/MyDrive/Colab Notebooks/AST/raw.datasource.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/message-queue-core.module.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/rest-api-exception.filter.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/workspace-missing-column.fixer.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/workspace-nullable.fixer.ts.txt"
            ],
            "top_features": "importdeclaration, stringliteral, identifier, exportkeyword, newexpression"
        },
        {
            "cluster_id": 0,
            "file_paths": [
                "/content/drive/MyDrive/Colab Notebooks/AST/1724056827317-addInvitation.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/1721057142509-fixIdentifierTypes.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/1730298416367-addAuthProvidersColumnsToWorkspace.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/1722855213422-addAuthProviders.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/1723281282713-addUserAuthConnection.ts.txt"
            ],
            "top_features": "identifier, expressionstatement awaitexpression callexpression, callexpression propertyaccessexpression identifier, callexpression propertyaccessexpression, expressionstatement"
        },
        {
            "cluster_id": 1,
            "file_paths": [
                "/content/drive/MyDrive/Colab Notebooks/AST/auth-providers.controller.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/auth-providers.module.ts.txt",
                "/content/drive/MyDrive/Colab Notebooks/AST/auth-providers.service.ts.txt"
            ],
            "top_features": "decorator callexpression identifier objectliteraleexpression, classdeclaration decorators classname, exportkeyword classdeclaration, implementsclause"
        }
    ]
    
    # Alternatively, load from a JSON file
    # clusters = load_cluster_data("clusters.json")
    
    # Analyze all clusters
    results = analyzer.analyze_all_clusters(clusters)
    
    # Compile and save the report
    report_path = analyzer.compile_report("data_sink_analysis_report.md")
    print(f"Analysis complete. Report saved to {report_path}")

if __name__ == "__main__":
    main() 