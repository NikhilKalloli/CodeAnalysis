import os
import json
import glob
from pathlib import Path
import logging
import sys
from tqdm import tqdm  # For progress bars

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('file_mapping.log')
    ]
)
logger = logging.getLogger(__name__)

def find_matching_file(base_dir, filename):
    """
    Find a matching file in the Twenty repository by searching recursively.
    
    Args:
        base_dir: Base directory to start the search
        filename: Filename to search for (without .txt extension)
        
    Returns:
        Relative path if found, otherwise None
    """
    # Remove .txt extension if present
    if filename.endswith('.txt'):
        filename = filename[:-4]
    
    # Convert to just the base filename without path
    base_filename = os.path.basename(filename)
    
    # Log the search
    logger.debug(f"Searching for file: {base_filename}")
    
    # Use glob to search recursively
    matches = []
    for match in glob.glob(f"{base_dir}/**/{base_filename}", recursive=True):
        # Convert to relative path and normalize path to use single forward slashes
        rel_path = os.path.relpath(match, os.getcwd()).replace('\\', '/')
        matches.append(rel_path)
    
    if matches:
        # For multiple matches, prefer ones in src/ directory
        src_matches = [m for m in matches if '/src/' in m]
        if src_matches:
            logger.debug(f"Found {base_filename} in src/ directory: {src_matches[0]}")
            return src_matches[0]
        logger.debug(f"Found {base_filename}: {matches[0]}")
        return matches[0]
    
    logger.debug(f"File not found: {base_filename}")
    return None

def map_file_paths_in_clusters(input_json_file, output_json_file, twenty_dir):
    """
    Update file paths in a cluster JSON file.
    
    Args:
        input_json_file: Input JSON file with old paths
        output_json_file: Output JSON file with updated paths
        twenty_dir: Root directory of Twenty repository
    """
    logger.info(f"Starting file path mapping process")
    logger.info(f"Input file: {input_json_file}")
    logger.info(f"Output file: {output_json_file}")
    logger.info(f"Twenty repository path: {twenty_dir}")
    
    # Create a mapping dictionary for quick lookups of already found files
    file_mapping = {}
    found_count = 0
    not_found_count = 0
    
    # Load input JSON
    try:
        with open(input_json_file, 'r') as f:
            logger.info(f"Loading cluster data from {input_json_file}")
            data = json.load(f)
            
            # Check if the file has a 'clusters' key (might be structured differently)
            if 'clusters' in data:
                clusters = data['clusters']
                logger.info(f"Found 'clusters' key with {len(clusters)} clusters")
            else:
                clusters = data
                logger.info(f"Loaded {len(clusters)} clusters directly")
    except FileNotFoundError:
        logger.warning(f"Input file {input_json_file} not found, creating sample clusters")
        # If no input file exists, create a sample cluster structure
        clusters = create_sample_clusters()
        logger.info(f"Created {len(clusters)} sample clusters")
    
    # Update file paths in each cluster
    logger.info(f"Processing {len(clusters)} clusters")
    for cluster_idx, cluster in enumerate(tqdm(clusters, desc="Processing clusters")):
        cluster_id = cluster.get("cluster_id", cluster_idx)
        old_file_paths = cluster.get("file_paths", [])
        new_file_paths = []
        
        logger.info(f"Processing cluster {cluster_id} with {len(old_file_paths)} files")
        
        for file_idx, old_path in enumerate(tqdm(old_file_paths, desc=f"Cluster {cluster_id} files", leave=False)):
            # Extract the filename from the old path
            filename = os.path.basename(old_path)
            
            # Check if we've already found this file
            if old_path in file_mapping:
                new_path = file_mapping[old_path]
                logger.debug(f"Using cached mapping for {filename}: {new_path}")
            else:
                # Find the matching file in Twenty repository
                new_path = find_matching_file(twenty_dir, filename)
                if new_path:
                    file_mapping[old_path] = new_path
                    found_count += 1
                    logger.debug(f"Found match for {filename}: {new_path}")
                else:
                    # If not found, keep the old path but remove .txt
                    if old_path.endswith('.txt'):
                        new_path = old_path[:-4]
                    else:
                        new_path = old_path
                    
                    # Normalize path to use single forward slashes
                    new_path = new_path.replace('\\', '/')
                    not_found_count += 1
                    logger.debug(f"No match found for {filename}, using {new_path}")
            
            new_file_paths.append(new_path)
            
            # Log progress every 10 files or at the end
            if (file_idx + 1) % 10 == 0 or file_idx == len(old_file_paths) - 1:
                logger.info(f"Processed {file_idx + 1}/{len(old_file_paths)} files in cluster {cluster_id}")
        
        # Update the cluster with new file paths
        cluster["file_paths"] = new_file_paths
    
    # Save the updated clusters to the output file
    with open(output_json_file, 'w', encoding='utf-8') as f:
        logger.info(f"Saving updated cluster data to {output_json_file}")
        json.dump(clusters, f, indent=2)
    
    logger.info(f"Created {output_json_file} with updated file paths")
    logger.info(f"Files found: {found_count}, Files not found: {not_found_count}")
    logger.info(f"Total mappings created: {len(file_mapping)}")
    
    # Return the mapping for reporting purposes
    return file_mapping

def create_sample_clusters():
    """Create a sample cluster structure if no input file exists."""
    logger.info("Creating sample cluster data")
    return [
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

def print_file_mapping_report(file_mapping):
    """Print a report of the file mapping results."""
    logger.info("\nFile Mapping Report:")
    logger.info("====================")
    logger.info(f"Total files mapped: {len(file_mapping)}")
    
    # Count files by directory
    dir_counts = {}
    for _, new_path in file_mapping.items():
        dir_path = os.path.dirname(new_path)
        dir_counts[dir_path] = dir_counts.get(dir_path, 0) + 1
    
    # Print directory statistics
    logger.info("\nFiles by directory:")
    for dir_path, count in sorted(dir_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
        logger.info(f"{dir_path}: {count} files")
    
    logger.info("\nExample mappings:")
    
    # Print a few examples
    for i, (old_path, new_path) in enumerate(list(file_mapping.items())[:5]):
        logger.info(f"{old_path} -> {new_path}")
    
    if len(file_mapping) > 5:
        logger.info("...")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Map file paths from Colab to Twenty repository")
    parser.add_argument("--input", default="cluster_details.json", help="Input JSON file (default: cluster_details.json)")
    parser.add_argument("--output", default="updated_clusters.json", help="Output JSON file (default: updated_clusters.json)")
    parser.add_argument("--repo", default="./twenty", help="Path to Twenty repository (default: ./twenty)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    # Set logging level based on verbosity
    if args.verbose:
        logger.setLevel(logging.DEBUG)
        logger.debug("Verbose logging enabled")
    
    # Print header
    logger.info("=" * 50)
    logger.info("File Path Mapping Tool")
    logger.info("=" * 50)
    
    try:
        # Map file paths
        file_mapping = map_file_paths_in_clusters(args.input, args.output, args.repo)
        
        # Print report
        print_file_mapping_report(file_mapping)
        
        logger.info("=" * 50)
        logger.info("Mapping completed successfully!")
        logger.info("=" * 50)
    except Exception as e:
        logger.error(f"Error during mapping process: {str(e)}", exc_info=True)
        logger.info("=" * 50)
        logger.info("Mapping failed with errors")
        logger.info("=" * 50) 