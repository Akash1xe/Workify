SELECT 'CREATE DATABASE sentinel_incident'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sentinel_incident')\gexec
