# This Dockerfile is an adaptation of the example from https://docs.docker.com/guides/vuejs/

# =========================================
# Stage 1: Build the Vue.js Application
# =========================================
# Use a lightweight DHI Node.js image for building
FROM dhi.io/node:24.18.0-alpine3.24-dev@sha256:be2d2424a15059dfce410220ab4ec2eedcb7c044c8117f4cddcc2fa7a4b968fb AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package-related files first to leverage Docker's caching mechanism
COPY package.json package-lock.json* ./

# Install project dependencies using npm ci (ensures a clean, reproducible install)
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy the rest of the application source code into the container
COPY . .

# Build the Vue.js application.
# As can be seen in package.json, this runs the type checker and then builds the app using Vite.
# The resulting files end up in /app/dist (i.e. WORKDIR/dist) by default.
# https://vite.dev/guide/build#building-for-production
RUN npm run build

# =========================================
# Stage 2: Prepare Nginx to Serve Static Files
# =========================================

FROM dhi.io/nginx:1.30.3-alpine3.24@sha256:96d1aa0daa861c5dea1122135ca740861ae0afd910d111c48844cd114103cf0c AS runner

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the static build output from the build stage to Nginx's default HTML serving directory
COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html

# Use a built-in non-root user for security best practices
USER nginx

# Expose port 8080 to allow HTTP traffic
# Note: The default Nginx container now listens on port 8080 instead of 80
EXPOSE 8080

# Start Nginx directly with custom config
ENTRYPOINT ["nginx", "-c", "/etc/nginx/nginx.conf"]
CMD ["-g", "daemon off;"]
