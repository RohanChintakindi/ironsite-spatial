"""
Spatial memory query endpoint.
"""

import logging

from fastapi import APIRouter, HTTPException, Request

from models.schemas import MemoryQuery, MemoryResult

router = APIRouter()
logger = logging.getLogger("ironsite.memory")


@router.post("/{run_id}/query", response_model=MemoryResult)
async def query_memory(run_id: str, query: MemoryQuery, request: Request):
    """Execute a spatial-memory query against the FAISS-backed store
    for the given pipeline run.

    Supported query types:

    - **label**: Find all frames containing objects whose label matches
      ``query.label`` (substring match).
    - **depth_range**: Find frames where any object (optionally filtered
      by ``query.label``) has a depth in ``[min_depth, max_depth]``.
    - **proximity**: Find frames where ``label_a`` is within
      ``max_distance`` metres of ``label_b`` (3D Euclidean).
    """
    runs = request.app.state.runs
    if run_id not in runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    run = runs[run_id]
    data = run.get("data", {})
    memory = data.get("memory")

    if memory is None:
        raise HTTPException(
            status_code=409,
            detail="Memory step has not completed for this run.",
        )

    try:
        if query.query_type == "label":
            if not query.label:
                raise HTTPException(
                    status_code=422,
                    detail="'label' field is required for query_type 'label'",
                )
            results = memory.query_label(query.label)

        elif query.query_type == "depth_range":
            min_d = query.min_depth if query.min_depth is not None else 0.0
            max_d = query.max_depth if query.max_depth is not None else 100.0
            results = memory.query_depth_range(min_d, max_d, label=query.label)

        elif query.query_type == "proximity":
            if not query.label_a or not query.label_b:
                raise HTTPException(
                    status_code=422,
                    detail="'label_a' and 'label_b' are required for query_type 'proximity'",
                )
            max_dist = query.max_distance if query.max_distance is not None else 2.0
            results = memory.query_proximity(query.label_a, query.label_b, max_m=max_dist)

        else:
            raise HTTPException(status_code=422, detail=f"Unknown query_type: {query.query_type}")

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Memory query failed")
        raise HTTPException(status_code=500, detail=str(exc))

    # Sanitise entries -- they may contain numpy types
    sanitised = []
    for entry in results:
        clean = {}
        for k, v in entry.items():
            if k == "detections":
                # Strip masks and ensure JSON-serialisable
                clean[k] = [
                    {dk: dv for dk, dv in det.items() if dk != "mask"}
                    for det in v
                ]
            else:
                clean[k] = v
        sanitised.append(clean)

    return MemoryResult(
        query=query,
        count=len(sanitised),
        entries=sanitised,
    )
