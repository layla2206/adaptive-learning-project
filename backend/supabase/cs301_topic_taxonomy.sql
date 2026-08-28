-- ========================================================================
-- cs301 topic taxonomy — built from the real content of the uploaded
-- lecture slides (CSEN301: Data Structures & Algorithms, German
-- University in Cairo), not invented labels. Already applied directly
-- against the live DB via the real PATCH /api/instructor/documents/[id]
-- endpoint (so the chunks.topic_id sync ran for real) — this file is the
-- reproducible record for a fresh setup, not a step that still needs
-- running against the current live DB.
-- ========================================================================

-- top-hash1 already existed (from the earlier single-subject scoping) but
-- was seeded at sort_order 1; its real position in the syllabus is Lecture 3.
UPDATE topics SET sort_order = 3 WHERE topic_id = 'top-hash1';

INSERT INTO topics (topic_id, course_id, topic_name, subtopic_name, sort_order) VALUES
('top-sort1', 'cs301', 'Sorting Algorithms', 'Simple Sorting & Analysis of Sorting Algorithms', 1),
('top-stack1', 'cs301', 'Stacks', 'Array-Based Stack Implementation', 4),
('top-queue1', 'cs301', 'Queues', 'Queue Implementation and Usage', 5),
('top-pq1', 'cs301', 'Priority Queues', 'Priority Queue Implementation', 6),
('top-list1', 'cs301', 'Lists & Linked Lists', 'Singly Linked List Fundamentals', 7),
('top-dlist1', 'cs301', 'Doubly Linked Lists', 'Doubly Linked List Implementation', 8),
('top-tree1', 'cs301', 'Introduction to Trees', 'Tree Terminology & Traversal Basics', 9),
('top-tree2', 'cs301', 'Introduction to Trees II', 'Binary Search Trees', 10)
ON CONFLICT (topic_id) DO NOTHING;

-- ========================================================================
-- Document -> topic tagging. Sets documents.topic_id AND syncs every
-- matching chunks.topic_id (a chunk's topic_id is fixed at embed time from
-- whatever the document's topic_id was then — re-tagging the document
-- alone does nothing for already-embedded chunks unless this sync also
-- runs; the real PATCH endpoint does this automatically).
-- ========================================================================

UPDATE documents SET topic_id = 'top-sort1' WHERE document_id = 'doc-d3cc47';
UPDATE documents SET topic_id = 'top-hash1' WHERE document_id IN ('doc-79508a', 'doc-dd8ac0', 'doc-038887');
UPDATE documents SET topic_id = 'top-stack1' WHERE document_id = 'doc-71818a';
UPDATE documents SET topic_id = 'top-queue1' WHERE document_id IN ('doc-78ec10', 'doc-6a1cfb');
UPDATE documents SET topic_id = 'top-pq1' WHERE document_id IN ('doc-40d7c5', 'doc-d317d6');
UPDATE documents SET topic_id = 'top-list1' WHERE document_id IN ('doc-c983c5', 'doc-9229af', 'doc-acf97a');
UPDATE documents SET topic_id = 'top-dlist1' WHERE document_id = 'doc-3f5188';
UPDATE documents SET topic_id = 'top-tree1' WHERE document_id IN ('doc-71ea52', 'doc-212715');
UPDATE documents SET topic_id = 'top-tree2' WHERE document_id IN ('doc-1850f7', 'doc-a38361');

UPDATE chunks c SET topic_id = d.topic_id
FROM documents d
WHERE c.document_id = d.document_id
  AND d.document_id IN (
    'doc-d3cc47', 'doc-79508a', 'doc-dd8ac0', 'doc-038887', 'doc-71818a',
    'doc-78ec10', 'doc-6a1cfb', 'doc-40d7c5', 'doc-d317d6', 'doc-c983c5',
    'doc-9229af', 'doc-acf97a', 'doc-3f5188', 'doc-71ea52', 'doc-212715',
    'doc-1850f7', 'doc-a38361'
  );

-- ========================================================================
-- Deliberately left untagged — not an oversight. Each of these is either
-- a Practice Assignment (content spans/lags multiple lectures rather than
-- matching its nominal lecture number — e.g. "Practice Assignment 3" is
-- about stack search, not the Hash Tables that Lecture 3 actually covers),
-- an exam paper, or a cross-topic complexity-review deck. Mistagging any
-- of these to one topic would make retrieval confidently wrong instead of
-- honestly absent. Revisit only if/when there's a real per-document
-- multi-topic model, not by picking a single best-guess topic:
--
--   doc-53d665, doc-01328b, doc-390482, doc-8758f0, doc-50c8e4,
--   doc-c784ae, doc-b5b973, doc-29a930   -- Practice Assignments
--   doc-fdd868                            -- exam paper
--   doc-f7a157                            -- cross-topic complexity review
--
-- Also untagged: the 7 documents still missing chunks entirely as of this
-- writing (blocked on the daily embedding quota, not content ambiguity) —
-- see backend/scripts/reembed_missing_chunks.py.
-- ========================================================================
