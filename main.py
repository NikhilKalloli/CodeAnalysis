import os
import json
import random
import pandas as pd
from bertopic import BERTopic
from umap import UMAP
from hdbscan import HDBSCAN
from openai import OpenAI

# Parameter settings for UMAP, HDBSCAN, and BERTopic
parameter_sets = {
    "default": {
        "umap": {"n_neighbors": 10, "n_components": 5, "metric": "cosine"},
        "hdbscan": {"min_cluster_size": 5},
        "bertopic": {"embedding_model": "all-MiniLM-L6-v2", "top_n_words": 10}
    }
}

# cluster summary
# services used as data sinks

def load_data(file="reas.csv"):
    # Load CSV data from the given file. The CSV is expected to have:
    # filepath, reasoning, summary, data_sink_reasoning, code_snippet
    if not os.path.exists(file):
        raise FileNotFoundError(file)
    df = pd.read_csv(file)
    expected_columns = ["filepath", "summary", "code_snippet", "data_sink_reasoning", "reasoning"]
    missing = [col for col in expected_columns if col not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in CSV: {missing}")
    return df

def run_topic_modeling(documents, parameter_set="default"):
    params = parameter_sets[parameter_set]

    original_docs = documents.copy()
    topic_model = BERTopic(
        embedding_model=params["bertopic"]["embedding_model"],
        umap_model=UMAP(**params["umap"]),
        hdbscan_model=HDBSCAN(**params["hdbscan"]),
        top_n_words=params["bertopic"]["top_n_words"],
        calculate_probabilities=False
    )
    topics, _ = topic_model.fit_transform(original_docs)
    topic_model.custom_docs = original_docs
    return topic_model, topics, None

def get_texts_by_topic(topic_model, topic_id):
    return [topic_model.custom_docs[i] for i, t in enumerate(topic_model.topics_) if t == topic_id]

def create_prompt(topic_model, topic_id):
    keywords = ", ".join([f"{word} ({score:.3f})" for word, score in topic_model.get_topic(topic_id)])
    cluster_texts = get_texts_by_topic(topic_model, topic_id)
    tagged_texts = "\n".join([f"<CODE_SNIPPET>{text}</CODE_SNIPPET>" for text in cluster_texts])
    prompt = (
        f"Number of Code Snippets: {len(cluster_texts)}\n"
        f"Code Snippets:\n{tagged_texts}\n\n"
    )
    return prompt, keywords, tagged_texts

def identify_services_by_mode(mode, parameter_set="default"):
    df = load_data()

    if mode == "CODE":
        documents = df["code_snippet"].fillna("").tolist()
    elif mode == "SUMMARY":
        documents = df["summary"].fillna("").tolist()
    elif mode == "REASON":
        documents = df["reasoning"].fillna("").tolist()
    elif mode == "SUMMARY+REASON":
        documents = [f"{s}\n\n{r}" for s, r in zip(df["summary"].fillna(""), df["reasoning"].fillna(""))]
    else:
        documents = df["code_snippet"].fillna("").tolist()
    
    topic_model, topics, _ = run_topic_modeling(documents, parameter_set=parameter_set)
    
    unique_topic_ids = sorted(set(topic_model.topics_))
    clusters = [tid for tid in unique_topic_ids if tid != -1]
    
    debug_lines = []
    debug_lines.append("===== CLUSTERING SUMMARY =====")
    debug_lines.append(f"Total number of documents: {len(topic_model.custom_docs)}")
    debug_lines.append(f"Total number of clusters (excluding noise): {len(clusters)}\n")
    
    for topic_id in clusters:
        cluster_texts = get_texts_by_topic(topic_model, topic_id)
        keywords = ", ".join([f"{word} ({score:.3f})" for word, score in topic_model.get_topic(topic_id)])
        indices = [str(i) for i, t in enumerate(topic_model.topics_) if t == topic_id]
        debug_lines.append(f"----- Cluster {topic_id} -----")
        debug_lines.append(f"Documents in cluster: {len(cluster_texts)}")
        debug_lines.append(f"Keywords: {keywords}")
        debug_lines.append(f"Document Indices: {', '.join(indices)}")
        debug_lines.append("")
    
    debug_log = "\n".join(debug_lines)
    print("Clustering Summary:")
    print(f"Clusters: {len(clusters)} | Total Documents: {len(topic_model.custom_docs)}")
    for topic_id in clusters:
        print(f"Cluster {topic_id}: {len(get_texts_by_topic(topic_model, topic_id))} docs")
    with open("debug_log.txt", "w", encoding="utf-8") as dbg_file:
        dbg_file.write(debug_log)
    
    results = []
    llm_debug_lines = []
    llm_call_counter = 1
    
    for topic_id in clusters:
        prompt_text, keyword_list, tagged_texts = create_prompt(topic_model, topic_id)
        # Save full prompt details in the LLM log file.
        llm_debug_lines.append(f"----- LLM Call {llm_call_counter} -----")
        llm_debug_lines.append(f"Cluster {topic_id} Prompt Details:")
        llm_debug_lines.append(prompt_text)
        # Print only a short message to terminal.
        print(f"\nLLM Call {llm_call_counter}: Prompt for Cluster {topic_id} sent.")
        
        openai_client = OpenAI(api_key=API_KEY)
        try:
            print(prompt_text)
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert security analyst. You are adept at analyzing codebases to idenitfy security vulnerabilities/issues, data sinks, data sources, data models, and so on. Your task is to identify specific services acting as data sinks like Redis, S3, filesystem, MySQL, PostgreSQL, RabbitMQ, etc. Use your wise judgement to identify and output such services."},
                    {"role": "user", "content": prompt_text}
                ],
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            parsed_response = json.loads(response.choices[0].message.content)
        except Exception as error:
            parsed_response = {"error": str(error)}
        
        llm_debug_lines.append("LLM Response:")
        llm_debug_lines.append(json.dumps(parsed_response, indent=2))
        llm_debug_lines.append("")
        # Print a simple confirmation to the terminal.
        print(f"LLM Call {llm_call_counter}: Response received.")
        
        results.append({
            "topic_id": topic_id,
            "keywords": keyword_list,
            "texts": tagged_texts,
            "response": parsed_response
        })
        llm_call_counter += 1
    
    # Write LLM call debugging info to a file.
    with open("llm_debug_log.txt", "w", encoding="utf-8") as llm_dbg_file:
        llm_dbg_file.write("\n".join(llm_debug_lines))
    pd.DataFrame(results).to_csv("llm_calls.csv", index=False)
    return results

def code_mode():
    return identify_services_by_mode("CODE")

def summary_mode():
    return identify_services_by_mode("SUMMARY")

def reason_mode():
    return identify_services_by_mode("REASON")

def summary_reason_mode():
    return identify_services_by_mode("SUMMARY+REASON")

if _name_ == "_main_":
    # For demonstration, we are using the "REASON" mode.
    output = identify_services_by_mode("CODE")