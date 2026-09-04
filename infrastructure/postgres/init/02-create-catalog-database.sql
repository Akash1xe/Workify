SELECT 'CREATE DATABASE sentinel_catalog'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sentinel_catalog')\gexec

