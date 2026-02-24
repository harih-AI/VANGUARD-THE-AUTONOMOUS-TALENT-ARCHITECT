# Build and Run Stage
FROM node:20-slim

WORKDIR /app

# Install system dependencies for better-sqlite3 and simple-git
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose the application port
EXPOSE 3000

# Directory for persistent data (SQLite and Repos)
RUN mkdir -p /app/data /app/repos /app/resumes

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/hackathon.db
ENV REPOS_DIR=/app/repos
ENV RESUMES_DIR=/app/resumes

# Start the application using tsx
CMD ["npm", "start"]
