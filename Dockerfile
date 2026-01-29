FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Expose the API port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
