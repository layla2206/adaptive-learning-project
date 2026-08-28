-- 1. Add r2_key to documents table
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS r2_key text;

-- 2. Drop the existing foreign key constraint on the chunks table
ALTER TABLE public.chunks DROP CONSTRAINT IF EXISTS chunks_document_id_fkey;

-- 3. Add the foreign key constraint with ON DELETE CASCADE
ALTER TABLE public.chunks
  ADD CONSTRAINT chunks_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(document_id)
  ON DELETE CASCADE;
