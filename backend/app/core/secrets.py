"""AWS Secrets Manager integration for secure credential management."""

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def load_firebase_from_secrets(secret_name: str) -> dict[str, Any]:
    """
    Load Firebase credentials from AWS Secrets Manager.
    
    Args:
        secret_name: Name of the secret in Secrets Manager (e.g., 'agriscan/firebase-service-account')
    
    Returns:
        Dictionary with Firebase service account credentials
        
    Raises:
        ValueError: If secret not found or invalid JSON
    """
    try:
        import boto3
        from botocore.exceptions import ClientError
    except ImportError:
        logger.warning("boto3 not installed. AWS Secrets Manager unavailable.")
        return {}

    try:
        client = boto3.client("secretsmanager")
        response = client.get_secret_value(SecretId=secret_name)
        
        # Secrets Manager returns either 'SecretString' (for text/JSON) or 'SecretBinary'
        if "SecretString" in response:
            secret = response["SecretString"]
            return json.loads(secret)
        else:
            logger.error(f"Secret {secret_name} is binary, expected JSON")
            return {}
            
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            logger.warning(f"Secret {secret_name} not found in AWS Secrets Manager")
        else:
            logger.error(f"Error loading secret {secret_name}: {e}")
        return {}
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in secret {secret_name}: {e}")
        return {}
    except Exception as e:
        logger.error(f"Unexpected error loading secret {secret_name}: {e}")
        return {}


def get_firebase_credentials_from_secrets(secret_name: str) -> dict[str, Optional[str]]:
    """
    Load Firebase credentials from Secrets Manager and extract individual fields.
    
    Expected secret JSON format (service account):
    {
      "type": "service_account",
      "project_id": "agriscan-e5bcc",
      "private_key_id": "...",
      "private_key": "...",
      ...
    }
    
    Args:
        secret_name: Name of the secret in Secrets Manager
        
    Returns:
        Dictionary with extracted Firebase configuration
    """
    secret_data = load_firebase_from_secrets(secret_name)
    if not secret_data:
        return {}
    
    # Return the service account as JSON string and project ID
    return {
        "firebase_service_account_json": json.dumps(secret_data),
        "firebase_project_id": secret_data.get("project_id"),
    }
