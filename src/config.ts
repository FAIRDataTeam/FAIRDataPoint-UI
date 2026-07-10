/**
 * TypeScript definitions of customizable runtime configuration defined in `public/config.js`.
 *
 * The FDP client is a client-side application that runs entirely in the browser, without any server-side rendering.
 * The application is typically deployed as a Docker container based on Nginx configured as a static file server.
 * Our Dockerfile uses a two-stage setup:
 * 1. build stage: build the app using vite
 * 2. production stage: copy the resuling static files into the final Nginx-based image
 * Users only run the final image from the second stage, which does not contain any build steps.
 * This implies that any kind of runtime customization must be done in a static file.
 * For this reason, we define our runtime configuration settings in a `public/config.js` file,
 * which is loaded in the header of `index.html`.
 * This allows users to override the runtime configuration using a Docker bind mount, if necessary.
 */

// Define the runtime configuration interface
export interface RuntimeConfig {
    fdpBaseUrl: string
}

// Let it be known that we expect `window` to have a `runtimeConfig` property.
declare global {
    interface Window {
        runtimeConfig: RuntimeConfig
    }
}

// Expose the config object to the outside world.
// Note that `window.runtimeConfig` is defined in `public/config.js`.
export const runtimeConfig: RuntimeConfig = window.runtimeConfig
