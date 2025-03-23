# Data Sink Pattern Analysis Summary


## fileSystem

### Function Patterns:
- \b(?:fwrite|fopen|writeFile|FileWriter)\b (Confidence: 0.8)
  Common file I/O functions like fwrite, fopen, writeFile, and FileWriter are direct indicators of data sink operations when used with write modes.
- open\([^)]*["']w[+"]? (Confidence: 0.9)
  File open operations with write ('w') or append ('a') modes explicitly create/overwrite files, indicating data sinks.

### File Patterns:
- \*\.\{log,csv,txt,db,json,xml\}
  Common data storage formats like logs, CSVs, databases, and structured data files frequently contain write operations to persist information.
- \*\.\{config,cfg,ini\}
  Configuration files are often modified programmatically to update settings, making them data sinks.

## database

### Function Patterns:
- \.(createTable|addColumn|addConstraint|addForeignKey|dropTable|alterColumn)\( (Confidence: 0.8)
  TypeORM migration methods like createTable/addColumn directly modify database schema structure, indicating schema-altering write operations

### File Patterns:
- \*\*/migrations/\*\.ts
  Database migration files contain schema modification instructions that persist structural changes to the database (data sink for DDL operations)

## network

### Function Patterns:
- \b(?:fetch|axios\.\w+|XMLHttpRequest|requests?\.(?:get|post|put|delete))\b (Confidence: 0.8)
  Common functions for HTTP requests that send/receive data to external endpoints

### File Patterns:
- \*api\*\.\{js,ts,py\}
  Files with 'api' naming conventions often contain API client logic and data sinks
- \*service\*\.\{js,ts,py\}
  Service layers typically handle network operations and external communications
- \*controller\*\.\{js,ts\}
  Controllers in web frameworks frequently make API calls to process requests

## apiEndpoints

### Function Patterns:
- app\.(get|post|put|delete)\s*\(\s*['"`]/api/ (Confidence: 0.8)
  Express.js HTTP methods with '/api/' routes indicate REST endpoint definitions
- res\.(json|send|end)\s*\( (Confidence: 0.9)
  Response methods directly send data to clients, creating explicit data sinks

### File Patterns:
- \*routes\*\.js
  Route files typically contain endpoint definitions and response handling logic
- controllers/*.js
  Controller files often process requests and return responses through data sinks

## clientServer

### Function Patterns:
- \(\?i\)\(CREATE\\s\+TABLE\|ALTER\\s\+TABLE\|ADD\\s\+CONSTRAINT\|DROP\\s\+CONSTRAINT\|CREATE\\s\+INDEX\) (Confidence: 0.8)
  SQL schema modification operations in migration files indicate data structure definitions and constraints that enforce data storage rules, representing persistent data sinks

### File Patterns:
- \*\*/migrations/\*\.ts
  TypeORM migration files directly modify database schema structures which govern how application data is stored and constrained, making them foundational data sink definitions

## cloudStorage

### Function Patterns:
- \b(upload_(file|bytes|text)|put_object|write|save(_to)?|copy_(to|from)|transfer|(s3|gcs|azure_blob)_[A-Za-z0-9_]+_write)\b (Confidence: 0.8)
  Common cloud storage SDK methods like upload_file, put_object, or write indicate data being sent to external storage services

### File Patterns:
- .*\.(config|conf|yml|yaml|json|tf|cfn)$
  Configuration files and infrastructure-as-code templates often contain cloud storage bucket names, connection strings, or access policies defining data sinks

## messageQueues

### Function Patterns:
- \.add\(|\.publish\( (Confidence: 0.8)
  Methods like add() or publish() are commonly used to enqueue messages in message queue producers

### File Patterns:
- \*message-queue\*\.ts
  Files containing message queue constants, decorators, or services likely define queue configurations
- \*-queue\.service\.ts
  Service files with naming conventions related to queues typically handle message production
- \*-producer\.service\.ts
  Files named with 'producer' suffix often contain message queue sending logic

## loggingServices

### Function Patterns:
- (https?:\/\/(?:\w+\.)*(splunkcloud\.com|datadoghq\.com|elk-internal\.net)(:\d+)?\/(?:services|api)\/(?:collector|v1|logstash)) (Confidence: 0.8)
  HTTP/S endpoints for Splunk HEC, Datadog API, and ELK Logstash indicate direct logging integrations
- (splunk_token|datadog_api_key|logstash_host)\s*[=:]\s*["'][\w-]+["'] (Confidence: 0.9)
  Credentials/configuration parameters specific to known logging services
- (LogEvent|MetricsLogger|ELKClient)\s*\( (Confidence: 0.7)
  Common class/method names from logging service SDKs

### File Patterns:
- (logging|telemetry)_config\.(json|yaml|conf)
  Centralized configuration files often contain service endpoints and credentials
- (docker-compose|helm)/.*\.(yml|yaml)
  Orchestration files may configure logging drivers/sidecars for these services
- /etc/(splunk-forwarder|datadog-agent|filebeat)/.*\.conf
  Agent configuration directories for enterprise logging tools

## cicdPipelines

### Function Patterns:
- pipeline\(.*,\s*fs\.createWriteStream\(.*\)\) (Confidence: 0.8)
  Pipeline operations writing to file streams indicate data persistence sinks in deployment processes

### File Patterns:
- src/database/typeorm/\*\*/migrations/\*\.ts
  Database migration files frequently contain schema changes and constraints that represent data sinks when deployed

## High Priority Patterns

## Priority Files/Directories

## Special Cases to Handle

## Potential False Positives
