
# PostgreSQL Database Migration Guide

This guide explains how to set up and migrate your application's settings and configurations from browser localStorage to a PostgreSQL database.

## Prerequisites

1. PostgreSQL server installed and running (version 12 or higher recommended)
2. A database created for the application
3. User with appropriate permissions to create tables, insert, update, and delete data

## Database Setup

### 1. Create a PostgreSQL Database

```sql
CREATE DATABASE avianet;
```

### 2. Create a User (Optional)

```sql
CREATE USER avianet_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE avianet TO avianet_user;
```

## Application Configuration

1. Open the Settings page in your application
2. Scroll to the "Database Configuration" section
3. Enter your PostgreSQL connection details:
   - Host (e.g., localhost)
   - Port (default: 5432)
   - Database name
   - Username
   - Password
   - Enable SSL if needed
4. Click "Test Connection" to verify the connection
5. If successful, click "Save Configuration"

## Migrating Your Data

After successfully connecting to the database:

1. Click "Migrate Settings to Database" to transfer your existing settings from browser localStorage to PostgreSQL
2. Enable the "Use Database" toggle at the top of the page to start using the database for all operations

## Database Schema

The migration process will automatically create the following tables:

### Settings Table
```sql
CREATE TABLE settings (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Event Types Table
```sql
CREATE TABLE event_types (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  notify_on_triggered BOOLEAN DEFAULT TRUE,
  severity VARCHAR(50) NOT NULL,
  record_video BOOLEAN DEFAULT FALSE,
  send_email BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Events Table
```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### AI Models Table
```sql
CREATE TABLE ai_models (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(255) NOT NULL,
  size VARCHAR(50),
  format VARCHAR(50),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB
);
```

### Camera-Model Assignments Table
```sql
CREATE TABLE camera_model_assignments (
  id SERIAL PRIMARY KEY,
  camera_id VARCHAR(100) NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(camera_id, model_id)
);
```

## Fallback Behavior

The application has built-in fallback mechanisms:

- If the database connection is lost, it will automatically fall back to using localStorage
- You can manually toggle between database and localStorage using the "Use Database" switch at the top of the Settings page

## Troubleshooting

### Connection Issues

If you cannot connect to the database:

1. Verify that your PostgreSQL server is running
2. Check that the database exists and the user has proper permissions
3. Ensure that your firewall or network settings allow connections to PostgreSQL
4. If using SSL, make sure your PostgreSQL server is configured for SSL connections

### Migration Errors

If you encounter errors during migration:

1. Check the browser console for detailed error messages
2. Verify that your PostgreSQL user has permissions to create tables and write data
3. Ensure that your database has sufficient disk space
4. Try refreshing the page and attempting the migration again

For any persistent issues, please contact support with the error details from the browser console.
