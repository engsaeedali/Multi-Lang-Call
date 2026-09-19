FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements if you have a requirements.txt, or we will generate it
COPY requirements.txt ./

# Install python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the agent code
COPY agent.py ./

# Set environment variables for production (to be overridden by Cloud Run)
ENV PYTHONUNBUFFERED=1

# Expose port (Cloud Run requires applications to listen on a port, usually 8080)
# LiveKit python agents run an HTTP server for health checks by default on 8081
EXPOSE 8081

# Command to run the agent
CMD ["python", "agent.py", "start"]
