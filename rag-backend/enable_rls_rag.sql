-- ============================================
-- RAG Backend RLS Policies & Schema Updates
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- Step 1: Add user_id columns
-- ============================================

-- Add user_id to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to document_chunks table (denormalized for query performance)
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON document_chunks(user_id);

-- ============================================
-- Step 2: Enable RLS
-- ============================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 3: Create RLS policies for documents
-- ============================================

CREATE POLICY "documents_select" ON documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "documents_insert" ON documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "documents_delete" ON documents
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Step 4: Create RLS policies for document_chunks
-- ============================================

CREATE POLICY "chunks_select" ON document_chunks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "chunks_insert" ON document_chunks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chunks_delete" ON document_chunks
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Step 5: Update match_documents function
-- Add user_id parameter for user-scoped search
-- ============================================

CREATE OR REPLACE FUNCTION match_documents (
    query_embedding vector(384),
    match_threshold float,
    match_count int,
    p_user_id uuid DEFAULT NULL  -- Optional user filter
)
RETURNS TABLE (
    id uuid,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        document_chunks.id,
        document_chunks.content,
        document_chunks.metadata,
        1 - (document_chunks.embedding <=> query_embedding) AS similarity
    FROM document_chunks
    WHERE 
        (p_user_id IS NULL OR document_chunks.user_id = p_user_id)
        AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
    ORDER BY document_chunks.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================
SELECT 'RAG Backend RLS policies and schema updates applied!' AS message;
