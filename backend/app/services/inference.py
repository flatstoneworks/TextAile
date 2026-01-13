"""LLM Inference Service for TextAile"""

import asyncio
import gc
import logging
from pathlib import Path
from threading import Thread
from typing import AsyncGenerator, Optional

import torch
import yaml
from huggingface_hub import scan_cache_dir, try_to_load_from_cache
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TextIteratorStreamer,
    BitsAndBytesConfig,
)

logger = logging.getLogger(__name__)


class LLMInferenceService:
    """Manages LLM loading and text generation with streaming"""

    def __init__(self, config_path: str = "config.yaml"):
        self.config = self._load_config(config_path)
        self.current_model_id: Optional[str] = None
        self.model = None
        self.tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.bfloat16 if self.device == "cuda" else torch.float32
        self._generation_thread: Optional[Thread] = None
        self._stop_generation = False

        logger.info(f"Inference service initialized. Device: {self.device}")

    def _load_config(self, config_path: str) -> dict:
        """Load model configuration from YAML"""
        path = Path(config_path)
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        with open(path, "r") as f:
            return yaml.safe_load(f)

    @property
    def models(self) -> dict:
        """Get all model configurations"""
        return self.config.get("models", {})

    @property
    def defaults(self) -> dict:
        """Get default settings"""
        return self.config.get("defaults", {})

    def get_model_info(self, model_id: str) -> Optional[dict]:
        """Get info for a specific model"""
        return self.models.get(model_id)

    def get_gpu_info(self) -> tuple[bool, Optional[str]]:
        """Get GPU availability and name"""
        if not torch.cuda.is_available():
            return False, None
        try:
            name = torch.cuda.get_device_name(0)
            return True, name
        except Exception:
            return False, None

    def is_model_cached(self, model_id: str) -> tuple[bool, Optional[float]]:
        """Check if a model is cached and get its size"""
        model_info = self.get_model_info(model_id)
        if not model_info:
            return False, None

        model_path = model_info["path"]
        try:
            # Try to find model in HuggingFace cache
            result = try_to_load_from_cache(
                repo_id=model_path,
                filename="config.json"
            )
            if result is None:
                return False, None

            # Get cache size
            cache_info = scan_cache_dir()
            for repo in cache_info.repos:
                if model_path in repo.repo_id:
                    size_gb = repo.size_on_disk / (1024 ** 3)
                    return True, round(size_gb, 2)

            return True, None
        except Exception as e:
            logger.debug(f"Cache check failed for {model_id}: {e}")
            return False, None

    def get_cache_stats(self) -> dict:
        """Get overall cache statistics"""
        try:
            cache_info = scan_cache_dir()
            total_size = sum(repo.size_on_disk for repo in cache_info.repos)
            return {
                "total_size_gb": round(total_size / (1024 ** 3), 2),
                "num_repos": len(cache_info.repos),
            }
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {"total_size_gb": 0, "num_repos": 0}

    def delete_model_cache(self, model_id: str) -> bool:
        """Delete a model from cache"""
        model_info = self.get_model_info(model_id)
        if not model_info:
            return False

        model_path = model_info["path"]
        try:
            cache_info = scan_cache_dir()
            for repo in cache_info.repos:
                if model_path in repo.repo_id:
                    # Delete all revisions
                    for revision in repo.revisions:
                        cache_info.delete_revisions(revision.commit_hash)
                    return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete cache for {model_id}: {e}")
            return False

    def load_model(self, model_id: str) -> None:
        """Load a model with Accelerate for optimal memory usage"""
        if self.current_model_id == model_id and self.model is not None:
            logger.info(f"Model {model_id} already loaded")
            return

        model_info = self.get_model_info(model_id)
        if not model_info:
            raise ValueError(f"Unknown model: {model_id}")

        logger.info(f"Loading model: {model_id} ({model_info['name']})")

        # Unload current model
        if self.model is not None:
            logger.info(f"Unloading previous model: {self.current_model_id}")
            del self.model
            del self.tokenizer
            self.model = None
            self.tokenizer = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        model_path = model_info["path"]

        try:
            # Load tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_path,
                trust_remote_code=True,
            )

            # Ensure pad token is set
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token

            # Load model with device_map for optimal placement
            self.model = AutoModelForCausalLM.from_pretrained(
                model_path,
                torch_dtype=self.dtype,
                device_map="auto",
                trust_remote_code=True,
            )

            self.current_model_id = model_id
            logger.info(f"Model {model_id} loaded successfully")

        except Exception as e:
            logger.error(f"Failed to load model {model_id}: {e}")
            self.model = None
            self.tokenizer = None
            self.current_model_id = None

            # Provide helpful error for gated models
            error_msg = str(e)
            if "gated repo" in error_msg.lower() or "403" in error_msg:
                approval_url = model_info.get("approval_url")
                if not approval_url:
                    approval_url = f"https://huggingface.co/{model_path}"
                raise RuntimeError(
                    f"Model '{model_info['name']}' requires approval. "
                    f"Request access at: {approval_url}"
                ) from e
            raise

    def stop_generation(self) -> None:
        """Request to stop ongoing generation"""
        self._stop_generation = True

    async def generate_stream(
        self,
        messages: list[dict],
        model_id: str,
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens using TextIteratorStreamer"""
        self._stop_generation = False

        # Load model if needed
        self.load_model(model_id)

        if self.model is None or self.tokenizer is None:
            raise RuntimeError("Model not loaded")

        # Format messages using chat template
        try:
            prompt = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        except Exception as e:
            # Fallback for models without chat template
            logger.warning(f"Chat template failed, using fallback: {e}")
            prompt = self._format_messages_fallback(messages)

        # Tokenize input
        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=self.get_model_info(model_id).get("context_length", 8192) - max_tokens,
        ).to(self.model.device)

        # Create streamer
        streamer = TextIteratorStreamer(
            self.tokenizer,
            skip_prompt=True,
            skip_special_tokens=True,
        )

        # Prepare generation kwargs
        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=max_tokens,
            do_sample=temperature > 0,
            pad_token_id=self.tokenizer.pad_token_id,
        )

        # Only add sampling params if do_sample is True
        if temperature > 0:
            generation_kwargs["temperature"] = temperature
            generation_kwargs["top_p"] = top_p

        # Run generation in a separate thread
        def generate():
            try:
                with torch.inference_mode():
                    self.model.generate(**generation_kwargs)
            except Exception as e:
                logger.error(f"Generation error: {e}")

        self._generation_thread = Thread(target=generate)
        self._generation_thread.start()

        # Stream tokens
        try:
            for text in streamer:
                if self._stop_generation:
                    logger.info("Generation stopped by user")
                    break
                yield text
                # Small delay to allow other async tasks to run
                await asyncio.sleep(0)
        finally:
            self._generation_thread = None

    def _format_messages_fallback(self, messages: list[dict]) -> str:
        """Fallback message formatting for models without chat template"""
        parts = []
        for msg in messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                parts.append(f"System: {content}")
            elif role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")
        parts.append("Assistant:")
        return "\n\n".join(parts)

    def generate_sync(
        self,
        messages: list[dict],
        model_id: str,
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: int = 2048,
    ) -> str:
        """Synchronous generation (non-streaming)"""
        self.load_model(model_id)

        if self.model is None or self.tokenizer is None:
            raise RuntimeError("Model not loaded")

        # Format messages
        try:
            prompt = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        except Exception:
            prompt = self._format_messages_fallback(messages)

        # Tokenize
        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
        ).to(self.model.device)

        # Generate
        generation_kwargs = dict(
            **inputs,
            max_new_tokens=max_tokens,
            do_sample=temperature > 0,
            pad_token_id=self.tokenizer.pad_token_id,
        )

        if temperature > 0:
            generation_kwargs["temperature"] = temperature
            generation_kwargs["top_p"] = top_p

        with torch.inference_mode():
            outputs = self.model.generate(**generation_kwargs)

        # Decode only the new tokens
        response = self.tokenizer.decode(
            outputs[0][inputs["input_ids"].shape[1]:],
            skip_special_tokens=True,
        )

        return response.strip()
