# AWS Secrets Manager Setup Guide for AgriScan Firebase

This guide explains how to securely store Firebase credentials in AWS Secrets Manager instead of committing them to source control.

## Step 1: Prepare Your Firebase Service Account

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key" (or use existing)
3. This downloads a JSON file with your service account credentials
4. Keep this file secure - you'll upload it to Secrets Manager

## Step 2: Create the Secret in AWS Secrets Manager

### Using AWS CLI:

```bash
# Store the Firebase service account JSON
aws secretsmanager create-secret \
  --name agriscan/firebase-service-account \
  --description "Firebase service account credentials for AgriScan" \
  --secret-string file://path/to/firebase-service-account.json \
  --region us-east-1  # Change to your AWS region
```

### Using AWS Console:

1. Go to AWS Secrets Manager
2. Click "Store a new secret"
3. Choose "Other type of secret"
4. Paste the contents of `firebase-service-account.json`
5. Name: `agriscan/firebase-service-account`
6. Click "Store"

## Step 3: Update Environment Configuration

### For Local Development (optional):
```bash
export AWS_SECRETS_MANAGER_SECRET_NAME=agriscan/firebase-service-account
export AWS_DEFAULT_REGION=us-east-1
```

### For AWS Deployment (ECS/AppRunner/Lambda):

Set the environment variable in your task definition or deployment:

```json
"environment": [
  {
    "name": "AWS_SECRETS_MANAGER_SECRET_NAME",
    "value": "agriscan/firebase-service-account"
  },
  {
    "name": "AWS_DEFAULT_REGION", 
    "value": "us-east-1"
  }
]
```

## Step 4: Configure IAM Permissions

Your ECS Task Role or Lambda execution role needs permission to read the secret.

### Add this policy to your task role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:agriscan/firebase-service-account-*"
    }
  ]
}
```

Replace:
- `us-east-1` with your AWS region
- `ACCOUNT_ID` with your AWS Account ID

### Using AWS CLI:

```bash
aws iam put-role-policy \
  --role-name your-ecs-task-role-name \
  --policy-name AllowSecretsManagerAccess \
  --policy-document file://policy.json
```

## Step 5: Update Dockerfile (Optional)

Since credentials are now in Secrets Manager, you can optionally remove the COPY line:

```dockerfile
# OLD (no longer needed):
# COPY firebase-service-account.json ./

# This is only needed if using local file fallback
```

## Step 6: Deploy

### Build & Push Docker Image:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
docker build -t agriscan-backend:latest backend/
docker tag agriscan-backend:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/agriscan-backend:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/agriscan-backend:latest
```

### Deploy to ECS/AppRunner:

Update your deployment configuration with the environment variable:
```bash
AWS_SECRETS_MANAGER_SECRET_NAME=agriscan/firebase-service-account
```

## Fallback Strategy (Hybrid Approach)

The code supports multiple methods - it will try them in this order:

1. **AWS Secrets Manager** (if `AWS_SECRETS_MANAGER_SECRET_NAME` is set)
2. **File path** (if `FIREBASE_SERVICE_ACCOUNT_FILE` points to a valid file)
3. **Environment variable** (if `FIREBASE_SERVICE_ACCOUNT_JSON` is set)

## Verification

To verify the setup works:

```bash
# Check if secret is accessible:
aws secretsmanager get-secret-value \
  --secret-id agriscan/firebase-service-account \
  --region us-east-1
```

Check your app logs for Firebase initialization:
```
Firebase Push Notifications: Enabled
```

## Troubleshooting

### Error: "Secret not found"
- Verify secret name matches: `agriscan/firebase-service-account`
- Check AWS region is correct
- Ensure IAM role has `secretsmanager:GetSecretValue` permission

### Error: "Invalid JSON in secret"
- Re-upload the secret with valid JSON from Firebase console

### Firebase still disabled
- Check logs for the actual missing fields
- Ensure `AWS_SECRETS_MANAGER_SECRET_NAME` environment variable is set
- Verify IAM permissions are attached to your task role

## Security Best Practices

✅ **DO:**
- Rotate service account keys regularly
- Use IAM roles (not access keys) for AWS authentication
- Limit Secrets Manager access to only what's needed
- Enable Secrets Manager encryption with KMS keys
- Audit access with CloudTrail

❌ **DON'T:**
- Commit Firebase credentials to Git
- Share service account JSON files
- Use long-lived AWS access keys (use IAM roles instead)
- Grant excessive Secrets Manager permissions
