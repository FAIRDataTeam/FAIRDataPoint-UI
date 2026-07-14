/**
 * Defines interface and loader for runtime configuration defined in JSON file.
 *
 * The FDP client is a client-side application that runs entirely in the browser, without any server-side rendering.
 * The application is typically deployed as a Docker container based on Nginx configured as a static file server.
 * Our Dockerfile uses a two-stage setup:
 * 1. Build stage: Build the app using vite.
 * 2. Runtime stage: Copy the resulting static files into the final Nginx-based image.
 * Users only run the final image from the second stage, which does not contain any build steps.
 * This implies that any kind of runtime customization must be done in a static file.
 * For this reason, we define our runtime configuration settings in a JSON file,
 * which is loaded before the app is created in `main.ts` with the help of `loadClientConfig`.
 * This allows users to override the runtime configuration using a Docker bind mount, if necessary.
 */

// Files from /public are served at root, so /public/config.json becomes /config.json
// https://vite.dev/guide/assets#the-public-directory
const CONFIG_FILE_PATH = '/config.json'

// The config is loaded from JSON file asynchronously, so we need to await loadClientConfig() once,
// and then use getClientConfig() whenever it is needed.
let clientConfig: ClientConfig | undefined

/**
 * Defines the runtime configuration for the application.
 */
export interface ClientConfig {
  fdpBaseUrl: string
}

/**
 * Loads runtime configuration from a JSON file located at `CONFIG_FILE_PATH`.
 * Do this once, then call `getClientConfig()` whenever the result is needed.
 */
export async function loadClientConfig(): Promise<void> {
  // Read the config file
  const response: Response = await fetch(CONFIG_FILE_PATH)
  if (!response.ok) {
    throw new Error(`Failed to load runtime configuration from file: ${CONFIG_FILE_PATH}`)
  }
  // Parse JSON and update the config object
  clientConfig = (await response.json()) as ClientConfig
}

/**
 * Gets the runtime config (a module-level singleton)
 */
export function getClientConfig(): ClientConfig {
  if (!clientConfig) {
    throw new Error('Runtime configuration not loaded. Call loadClientConfig first.')
  }
  return clientConfig
}
