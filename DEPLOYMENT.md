# Google Cloud Platform (GCP) Deployment Guide

This guide details how to deploy the Multi-Lang-Call application (Next.js Frontend, Python Agent, and LiveKit SFU) to Google Cloud Platform using continuous integration via GitHub.

## 1. Deploying the LiveKit Server (SFU) & Redis

LiveKit requires dedicated networking for UDP audio/video streams, so a Compute Engine Virtual Machine (VM) is the best choice.

1.  **Create a Compute Engine VM:**
    *   Go to the Google Cloud Console -> **Compute Engine** -> **VM instances**.
    *   Click **Create Instance**.
    *   Choose a region close to your users (e.g., `us-central1` or `europe-west3`).
    *   Machine type: `e2-medium` (or higher depending on expected traffic).
    *   OS: Ubuntu 22.04 LTS.
    *   **Firewall:** Allow HTTP and HTTPS traffic.
2.  **Configure Network Ports:**
    *   Go to **VPC Network** -> **Firewall**.
    *   Create a rule to allow incoming UDP traffic on ports `50000-60000` (for WebRTC media) and TCP port `7881` for WebRTC over TCP fallback.
3.  **Install LiveKit:**
    *   SSH into your VM.
    *   Run the official installation script according to the LiveKit documentation.
    *   Generate production keys using `livekit-server generate-keys`. Save the `API Key` and `API Secret`.
    *   Start the server using Docker or systemd with your generated keys.
    *   Alternatively, LiveKit provides a streamlined [Cloud Deployment script](https://docs.livekit.io/realtime/self-hosting/deployment/) which sets up Docker, Redis, and a Let's Encrypt SSL certificate automatically. **Using an SSL certificate (HTTPS/WSS) is mandatory for browser WebRTC permissions.**

**Alternative (Recommended for PoC):** Use [LiveKit Cloud](https://cloud.livekit.io/). It provides a managed SFU with free tiers. You will get a WebSocket URL (`wss://<project>.livekit.cloud`) and API Keys instantly.

## 2. Deploying the Next.js Frontend

We will use **Cloud Run** for a serverless, scalable frontend deployment.

1.  **Enable Cloud Run API:** In the GCP Console, search for and enable the "Cloud Run API" and "Cloud Build API".
2.  **Deploy via GitHub Integration:**
    *   Go to **Cloud Run**.
    *   Click **Create Service**.
    *   Select **Continuously deploy new revisions from a source repository**.
    *   Click **Set up with Cloud Build**.
    *   Connect your GitHub account and select the `engsaeedali/Multi-Lang-Call` repository.
    *   Branch: `^main$`.
    *   Build Type: Dockerfile.
    *   Source location: `/frontend/Dockerfile`.
3.  **Configure the Service:**
    *   Service name: `frontend` (or similar).
    *   Region: Same as your LiveKit server (or close to it).
    *   Authentication: **Allow unauthenticated invocations** (Publicly accessible).
    *   Container port: `3000`.
4.  **Set Environment Variables:**
    *   Expand the "Containers, Volumes, Networking, Security" section.
    *   Under the **Variables & Secrets** tab, add:
        *   `LIVEKIT_API_KEY`: The API key from your LiveKit server/Cloud.
        *   `LIVEKIT_API_SECRET`: The API secret.
        *   `NEXT_PUBLIC_LIVEKIT_URL`: The WebSocket URL for the frontend to connect to (e.g., `wss://your-domain.com` or `wss://your-project.livekit.cloud`).
5.  **Create:** Click Create. Cloud Build will pull your code, build the Docker image, and deploy it.

## 3. Deploying the Python LiveKit Agent

We will also use **Cloud Run** for the Agent, but configured as a continuous background worker.

1.  **Deploy via GitHub Integration:**
    *   Go to **Cloud Run** and click **Create Service**.
    *   Select **Continuously deploy new revisions from a source repository**.
    *   Connect GitHub and select the `engsaeedali/Multi-Lang-Call` repository.
    *   Source location: `/agent/Dockerfile`.
2.  **Configure the Service:**
    *   Service name: `ai-agent`.
    *   Region: Same as your LiveKit server.
    *   Authentication: **Require authentication** (This service doesn't need to be publicly accessible from the web).
3.  **Critical Configuration for Agents:**
    *   Under "Containers, Volumes, Networking, Security" -> **General**:
        *   Change **CPU allocation and pricing** to: **CPU is always allocated**. This is essential because the agent needs to continuously listen for LiveKit room events in the background, not just when an HTTP request arrives.
        *   Minimum number of instances: `1`.
    *   Container port: `8081` (The LiveKit Python agent SDK opens an HTTP server on 8081 for health checks).
4.  **Set Environment Variables:**
    *   Under **Variables & Secrets**, add:
        *   `LIVEKIT_URL`: The WebSocket URL of your LiveKit server (must be `wss://`).
        *   `LIVEKIT_API_KEY`: Your LiveKit API key.
        *   `LIVEKIT_API_SECRET`: Your LiveKit API secret.
        *   *(Later)* `DEEPGRAM_API_KEY` and `GEMINI_API_KEY` when you transition from mock adapters to real models.
5.  **Create:** Click Create. The agent will spin up, connect to your LiveKit URL, and wait for users to join rooms.
