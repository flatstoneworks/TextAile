"""Model management endpoints"""

from datetime import datetime
from fastapi import APIRouter, HTTPException

from ..models.schemas import ModelInfo, ModelDetailedInfo, HealthResponse

router = APIRouter(prefix="/api", tags=["models"])


def get_inference_service():
    """Get the inference service instance"""
    from ..main import inference_service
    return inference_service


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    service = get_inference_service()
    gpu_available, gpu_name = service.get_gpu_info()

    return HealthResponse(
        status="ok",
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        current_model=service.current_model_id,
    )


@router.get("/models", response_model=list[ModelInfo])
async def list_models():
    """List all available models"""
    service = get_inference_service()
    models = []

    for model_id, info in service.models.items():
        models.append(ModelInfo(
            id=model_id,
            name=info["name"],
            path=info["path"],
            category=info["category"],
            size_gb=info["size_gb"],
            context_length=info["context_length"],
            description=info["description"],
            tags=info.get("tags", []),
            requires_approval=info.get("requires_approval", False),
            approval_url=info.get("approval_url"),
        ))

    return models


@router.get("/models/detailed", response_model=list[ModelDetailedInfo])
async def list_models_detailed():
    """List all models with cache information"""
    service = get_inference_service()
    models = []

    for model_id, info in service.models.items():
        is_cached, cache_size = service.is_model_cached(model_id)

        models.append(ModelDetailedInfo(
            id=model_id,
            name=info["name"],
            path=info["path"],
            category=info["category"],
            size_gb=info["size_gb"],
            context_length=info["context_length"],
            description=info["description"],
            tags=info.get("tags", []),
            requires_approval=info.get("requires_approval", False),
            approval_url=info.get("approval_url"),
            is_cached=is_cached,
            cache_size_gb=cache_size,
            last_accessed=datetime.now() if is_cached else None,  # Placeholder
        ))

    return models


@router.get("/models/cache-status")
async def get_cache_status():
    """Get overall cache statistics"""
    service = get_inference_service()
    return service.get_cache_stats()


@router.get("/models/{model_id}", response_model=ModelDetailedInfo)
async def get_model(model_id: str):
    """Get details for a specific model"""
    service = get_inference_service()
    info = service.get_model_info(model_id)

    if not info:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    is_cached, cache_size = service.is_model_cached(model_id)

    return ModelDetailedInfo(
        id=model_id,
        name=info["name"],
        path=info["path"],
        category=info["category"],
        size_gb=info["size_gb"],
        context_length=info["context_length"],
        description=info["description"],
        tags=info.get("tags", []),
        requires_approval=info.get("requires_approval", False),
        approval_url=info.get("approval_url"),
        is_cached=is_cached,
        cache_size_gb=cache_size,
    )


@router.delete("/models/{model_id}/cache")
async def delete_model_cache(model_id: str):
    """Delete a model from cache"""
    service = get_inference_service()

    if not service.get_model_info(model_id):
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    # Can't delete currently loaded model
    if service.current_model_id == model_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete cache for currently loaded model"
        )

    success = service.delete_model_cache(model_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Model not found in cache"
        )

    return {"status": "deleted", "model_id": model_id}


@router.post("/models/{model_id}/download")
async def download_model(model_id: str):
    """Download/preload a model to cache"""
    service = get_inference_service()

    if not service.get_model_info(model_id):
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    try:
        # Load the model (this will download it if not cached)
        service.load_model(model_id)
        return {"status": "downloaded", "model_id": model_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
