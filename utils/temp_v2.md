# Data Sink Pattern Analysis Summary


## fileSystem

### Function Patterns:

### File Patterns:

## database

### Function Patterns:

### File Patterns:

## network

### Function Patterns:

### File Patterns:

## apiEndpoints

### Function Patterns:

### File Patterns:

## clientServer

### Function Patterns:
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined

### File Patterns:
- undefined
  undefined
- undefined
  undefined
- undefined
  undefined
- undefined
  undefined
- undefined
  undefined

## cloudStorage

### Function Patterns:
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined

### File Patterns:
- undefined
  undefined
- undefined
  undefined
- undefined
  undefined

## messageQueues

### Function Patterns:
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined

### File Patterns:
- undefined
  undefined
- undefined
  undefined
- undefined
  undefined

## loggingServices

### Function Patterns:
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined

### File Patterns:
- undefined
  undefined
- undefined
  undefined
- undefined
  undefined
- undefined
  undefined

## cicdPipelines

### Function Patterns:
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined
- undefined (Confidence: undefined)
  undefined

### File Patterns:
- undefined
  undefined
- undefined
  undefined
- undefined
  undefined

## High Priority Patterns
- Database write operations (e.g., INSERT, UPDATE, DELETE)
  Reason: Direct data sinks for persistent storage in PostgreSQL. Critical for tracking data flow and potential injection points.
- BullMQ job queue operations (.add(), .process())
  Reason: Background jobs may process sensitive data. Need to verify input validation in job handlers.
- API endpoints (@Post(), @Put()) with request body parameters
  Reason: Backend entry points that could write to database or external services. Validate data handling in controllers/services.
- Redis cache set operations (SET, HSET)
  Reason: Cached data might contain sensitive information. Check TTL configurations and cache key validation.
- File system write operations (fs.writeFile, writeFileSync)
  Reason: Potential storage of user-uploaded files or logs. Verify path sanitization and access controls.

## Priority Files/Directories
- server/src/core/**/*.controller.ts
  Reason: NestJS controllers handle API endpoints. Primary entry points for external data input.
- server/src/core/**/*.service.ts
  Reason: Services contain business logic and database interactions. Likely location for data sink operations.
- server/src/jobs/**/*.processor.ts
  Reason: BullMQ job processors handle background tasks that may process/store sensitive data.
- server/src/core/engine/**/*.ts
  Reason: Integration engine modules likely handle external system communications and data exports.
- server/src/database/**/*-repository.ts
  Reason: TypeORM repository classes directly interact with database tables.

## Special Cases to Handle
- Batch operations with array inputs
  Handling: Check for proper iteration and validation of each element in bulk create/update operations.
- Recurring jobs with persistent data
  Handling: Verify data retention policies and cleanup mechanisms for periodic tasks.
- GraphQL mutations
  Handling: Analyze resolver functions in addition to REST controllers for data modification operations.
- Soft delete patterns (@DeleteDateColumn())
  Handling: Treat soft deletes as updates to flag records rather than actual deletions.
- TypeORM subscribers/listeners
  Handling: Check for afterInsert/afterUpdate hooks that might trigger secondary data sinks.

## Potential False Positives
- Read-only Redis operations (GET, HGET)
  Reason: Cache retrieval doesn't constitute data sink unless combined with write operations elsewhere.
- Database SELECT queries
  Reason: Only relevant when combined with write operations or insecure data exposure.
- Logging statements (console.log, Logger)
  Reason: Unless logging sensitive data to external systems, typically not considered data sinks.
- Temporary file creation with auto-cleanup
  Reason: Ephemeral storage that gets deleted automatically might not require tracking.
- TypeORM relation decorators (@OneToMany)
  Reason: Metadata definitions don't directly write data without corresponding service methods.
