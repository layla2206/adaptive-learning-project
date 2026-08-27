from typing import Any, Dict, Iterable, List


SNIPPET_LENGTH = 180


def make_snippet(text: Any, max_length: int = SNIPPET_LENGTH) -> str:
    if not isinstance(text, str):
        return ""

    normalized = " ".join(text.split())
    if len(normalized) <= max_length:
        return normalized

    boundary = normalized.rfind(" ", 0, max_length + 1)
    if boundary <= 0:
        return normalized[:max_length].rstrip()
    return normalized[:boundary].rstrip()


def map_chunk(chunk: Dict[str, Any]) -> Dict[str, Any]:
    document_title = chunk.get("document_title") or chunk.get("file_name") or "Unknown document"
    location = chunk.get("location")
    if location is None:
        location = chunk.get("page_number")
    if location is None:
        location = chunk.get("section")

    mapped = dict(chunk)
    mapped["document_title"] = document_title
    mapped["location"] = location
    mapped["snippet"] = make_snippet(chunk.get("chunk_text"))
    return mapped


def map_citations(chunks: Iterable[Dict[str, Any]], cited_ids: Iterable[Any]) -> List[Dict[str, Any]]:
    mapped_chunks = [map_chunk(chunk) for chunk in chunks]
    chunks_by_id = {chunk.get("chunk_id"): chunk for chunk in mapped_chunks}
    citations = []
    for cited_id in cited_ids:
        chunk = chunks_by_id.get(cited_id)
        if chunk is None:
            continue

        location = chunk["location"]
        source = chunk["document_title"]
        if location is not None:
            source = f"{source} · Page {location}"
        citations.append({
            "mark": f"[{len(citations) + 1}]",
            "source": source,
            "excerpt": chunk["snippet"],
            "chunk_id": chunk.get("chunk_id"),
            "document_title": chunk["document_title"],
            "location": location,
            "snippet": chunk["snippet"],
        })
    return citations