SELECT 'CREATE DATABASE sentinel_org'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sentinel_org')\gexec

