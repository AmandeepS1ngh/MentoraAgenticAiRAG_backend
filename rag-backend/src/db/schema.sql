-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store processed documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamp with time zone default now()
);

-- Create a table to store document chunks and their embeddings
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content text,
  metadata jsonb,
  embedding vector(384), -- 384 dimensions for all-MiniLM-L6-v2
  created_at timestamp with time zone default now()
);

-- Create a function to search for documents
create or replace function match_documents (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    document_chunks.id,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
