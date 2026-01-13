"""Secrets Store for TextAile

Manages API keys and other secrets for MCP servers.
Stores secrets in a local JSON file (not committed to git).
"""

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class SecretsStore:
    """Simple file-based secrets storage"""

    def __init__(self, secrets_path: str = "secrets.json"):
        self.secrets_path = Path(secrets_path)
        self._secrets: dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        """Load secrets from file"""
        if self.secrets_path.exists():
            try:
                with open(self.secrets_path) as f:
                    self._secrets = json.load(f)
                logger.info(f"Loaded {len(self._secrets)} secrets")
            except Exception as e:
                logger.error(f"Failed to load secrets: {e}")
                self._secrets = {}
        else:
            self._secrets = {}

    def _save(self) -> None:
        """Save secrets to file"""
        try:
            with open(self.secrets_path, "w") as f:
                json.dump(self._secrets, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save secrets: {e}")

    def get(self, key: str) -> Optional[str]:
        """Get a secret value"""
        return self._secrets.get(key)

    def set(self, key: str, value: str) -> None:
        """Set a secret value"""
        self._secrets[key] = value
        self._save()
        logger.info(f"Saved secret: {key}")

    def delete(self, key: str) -> bool:
        """Delete a secret"""
        if key in self._secrets:
            del self._secrets[key]
            self._save()
            logger.info(f"Deleted secret: {key}")
            return True
        return False

    def has(self, key: str) -> bool:
        """Check if a secret exists"""
        return key in self._secrets

    def list_keys(self) -> list[str]:
        """List all secret keys (not values)"""
        return list(self._secrets.keys())
