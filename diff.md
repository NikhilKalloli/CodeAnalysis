# Key Differences Between v1_analyse_clusters.py and v2_analyse_clusters.py

## 1. Service Relationship Analysis (New in v2)

- **v2** adds `extract_service_relationships()` and supporting methods to:
  - Track imports between services/modules
  - Detect method calls between services
  - Generate Mermaid flow charts of service interactions
- **v1** only analyzed individual files without relationship mapping

## 2. Flow Chart Generation (New in v2)

```python
# v2 Exclusive
def generate_flow_chart(relationships_data): ...
```

- Generates Mermaid diagrams showing service dependencies
- Visualizes controller-service-repository relationships
- Shows data flow between Stripe/webhook services and core logic

## 3. Enhanced AST Pattern Recognition

- **v2** adds deeper analysis of:
  - Class method definitions/usage
  - Export/import patterns between files
  - Database entity relationships (TypeORM-specific patterns)
- **v1** only tracked basic declaration types

## 4. Improved Billing System Specificity

```python
# v2 adds Stripe-specific handling
def _extract_service_from_import(self, import_path):
    if 'stripe' in import_path:
        return 'StripeIntegration'
```

## 5. Report Enhancements

- **v2** reports now include:
  - Service relationship diagrams
  - Stripe API interaction analysis
  - Webhook payload transformation tracking
  - Database sync operations between internal/external systems
- **v1** reports were limited to basic AST patterns

## 6. New Security Analysis

```python
# v2 prompt includes
"5. Are there any potential security concerns with how data is being handled?"
```

- Checks for plaintext API keys
- Validates webhook signature verification
- Reviews database connection handling

## 7. Enhanced Cluster Categorization

- **v2** better detects:
  - Payment processing clusters
  - Webhook handler groups
  - Database sync services
  - API gateway controllers

## 8. Performance Improvements

- Added memoization for AST simplification
- Parallel processing of large AST files
- Batched API calls to DeepSeek

## 9. New Command Line Options

```python
# v2 exclusive args
parser.add_argument('--include-diagrams', action='store_true')
parser.add_argument('--max-relationships', type=int)