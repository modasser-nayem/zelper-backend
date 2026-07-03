# Use a multi-stage build to reduce the final image size
# Stage 1: Building the typescript code and generating prisma client
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Only copy package dependencies first to leverage Docker layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy the rest of the application
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the TypeScript code
RUN npm run build

# Stage 2: Production environment
FROM node:20-alpine

WORKDIR /usr/src/app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package info and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies for a lightweight image
RUN npm ci --omit=dev

# Regenerate Prisma Client on the production image
RUN npx prisma generate

# Copy the compiled typescript code and public assets from the builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/public ./public

# Create logs directory to prevent volume mounting errors
RUN mkdir -p logs

# Expose the API port
EXPOSE 5021

# Start the application
CMD ["npm", "start"]
