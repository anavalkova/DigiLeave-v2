#!/usr/bin/env bash
# deploy.sh — Build, push, and deploy Digileave to Cloud Run + Firebase Hosting.
# Usage: MONGODB_URI="..." GOOGLE_CLIENT_ID="..." ./deploy.sh
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration — edit once, then leave alone
# ─────────────────────────────────────────────────────────────────────────────
GCP_PROJECT="digileave-prod"      # gcloud projects list
REGION="europe-west1"                   # Cloud Run + Artifact Registry region
AR_REPO="digileave"                     # Artifact Registry repository name
SERVICE="digileave-api"                 # Cloud Run service name
FIREBASE_PROJECT="digileave-prod"       # Firebase project ID  (firebase projects:list)
MONGO_SECRET="digileave-mongodb-uri"    # Secret Manager secret name for the DB URI
# ─────────────────────────────────────────────────────────────────────────────

# Secrets must be set in your shell before running — never hardcode them here:
#   export MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/digileave"
#   export GOOGLE_CLIENT_ID="921586348226-....apps.googleusercontent.com"
: "${MONGODB_URI:?Set MONGODB_URI before deploying}"
: "${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID before deploying}"

IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${SERVICE}"

# ── 1. GCP auth & project ─────────────────────────────────────────────────────
echo "▶ Configuring GCP project..."
gcloud config set project "$GCP_PROJECT"

# ── 2. Artifact Registry repo (idempotent) ────────────────────────────────────
if ! gcloud artifacts repositories describe "$AR_REPO" \
       --location="$REGION" --quiet 2>/dev/null; then
  echo "▶ Creating Artifact Registry repository..."
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Digileave container images"
fi

# ── 3. Build & push image via Cloud Build (no local Docker required) ─────────
echo "▶ Building image in Cloud Build and pushing to Artifact Registry..."
gcloud builds submit ./api \
  --tag "${IMAGE}:latest" \
  --region="$REGION"

# ── 4. Store MONGODB_URI in Secret Manager ────────────────────────────────────
# Database credentials must never travel as plain env vars — use Secret Manager.
if ! gcloud secrets describe "$MONGO_SECRET" --quiet 2>/dev/null; then
  echo "▶ Creating Secret Manager secret ${MONGO_SECRET}..."
  printf '%s' "$MONGODB_URI" | gcloud secrets create "$MONGO_SECRET" \
    --data-file=- \
    --replication-policy=automatic
else
  echo "▶ Updating Secret Manager secret ${MONGO_SECRET}..."
  printf '%s' "$MONGODB_URI" | gcloud secrets versions add "$MONGO_SECRET" \
    --data-file=-
fi

# Grant the default Compute service account access to read the secret
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT" --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding "$MONGO_SECRET" \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

# ── 5. Deploy to Cloud Run ────────────────────────────────────────────────────
echo "▶ Deploying backend to Cloud Run..."

# ^|^ is a custom delimiter so the comma inside ALLOWED_ORIGINS doesn't confuse
# --set-env-vars (which normally uses comma as the key=value separator).
gcloud run deploy "$SERVICE" \
  --image="${IMAGE}:latest" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --set-env-vars="^|^GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}|ALLOWED_ORIGINS=https://${FIREBASE_PROJECT}.web.app,https://${FIREBASE_PROJECT}.firebaseapp.com" \
  --update-secrets="MONGODB_URI=${MONGO_SECRET}:latest"

SERVICE_URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --format="value(status.url)")
echo "✓ Backend live at: ${SERVICE_URL}"

# ── 6. Build React app ────────────────────────────────────────────────────────
echo "▶ Building React frontend..."
(
  cd my-vacation-app
  # Write .env.production so Vite bakes the real URLs into the bundle at build time.
  # This file is gitignored — it is generated fresh on every deploy.
  cat > .env.production <<ENV
VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
VITE_API_BASE_URL=${SERVICE_URL}
ENV
  npm ci --silent
  npm run build
)

# ── 7. Deploy to Firebase Hosting ─────────────────────────────────────────────
echo "▶ Deploying frontend to Firebase Hosting..."
(
  cd my-vacation-app
  npx firebase-tools deploy --only hosting \
    --project "$FIREBASE_PROJECT" \
    --non-interactive
)

echo ""
echo "✅ Deployment complete."
echo "   Backend : ${SERVICE_URL}"
echo "   Frontend: https://${FIREBASE_PROJECT}.web.app"
