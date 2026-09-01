# FAIR Data Point UI

A browser-based user interface for FAIR Data Point (FDP) administration.

> [!WARNING]
> FAIRDataPoint-UI is still in the early development phase and is not production-ready.
> Currently, it can be used to view an FDP, but editing an FDP is not possible yet.
> We are actively developing, so keep an eye on the [releases] page for any news.

> [!NOTE]
> FAIRDataPoint-UI replaces the legacy [FAIRDataPoint-client], which will be archived.

<!-- TODO: Change the original FAIRDataPoint-client repository status to "Archived" on GitHub -->

## FAIR Data Point User Interface

The FAIR Data Point _User Interface_ (FDP UI) provides a web-based user interface that makes it easier for humans to interact with a FAIR Data Point by hiding the interactions with the FDP API.
The UI is a JavaScript (TypeScript) application that runs entirely in the browser, without any server-side rendering.
Under the hood, the FDP UI uses the JavaScript [Fetch API] to make HTTP requests to a remote FDP API that complies with the [FDP 1.2 specification].
The main goal of the FDP UI is to enable basic administration of the FDP, inspection of FDP content, and execution of simple queries.

> [!NOTE]
> The FDP UI was not designed for bulk operations or advanced queries.
> Those are best performed by direct interaction with the FDP API.

### Quickstart

The FDP UI is published as a Docker image ([fairdata/fairdatapoint-ui]) and is designed to run in a container.
The Docker image is based on the official [Nginx hardened image], configured as a static file server listening on port `8080`.

One way to deploy the UI is using [Docker Compose], as follows:

```yaml
# compose.yaml
services:
  fdp-ui:
    image: fairdata/fairdatapoint-ui
    # ...
    volumes:
      # Override the default runtime config to specify the URL of the FDP API
      - './my.config.json:/usr/share/nginx/html/config.json'
      # [optional] Custom CSS style file
      - './my.custom.css:/usr/share/nginx/html/custom.css'
      # [optional] Custom logo
      - './my.logo.png:/usr/share/nginx/html/assets/logo.png'
```

where `my.config.json` is a custom runtime configuration file that defines the primary endpoint URL of the FDP API, for example:

```yaml
# my.config.json
{ apiEndpointUrl: https://fdp.example.org }
```

The custom CSS file and custom logo are both optional.

It is also possible to run the FDP UI application from source, but this is only recommended for UI development purposes.

### Setting up a development machine

#### Dependencies and development server

Here's how to install project dependencies and run the development server, provided you've got [npm] installed:

1. Install dependencies (including dev dependencies),

   - either using [npm clean-install] to create a reproducible installation from `package-lock.json`

     ```bash
     npm ci
     ```

   - or using "normal" [npm install] to install from `package.json`, which is likely to update `package-lock.json`

     ```bash
     npm install
     ```

2. Run the [vite development server], as described in the [Vue.js quickstart] docs (also see `scripts` in [package.json]):

   ```bash
   npm run dev
   ```

   To specify a custom port, we can use the `--port` argument.
   For example:

   ```bash
   npm run dev -- --port 8000
   ```

   Also see [vite development server] for more options.

#### App configuration for development

The browser-based UI application needs an API, provided by a FAIR Data Point (FDP), to function properly.
The URL for the primary API endpoint is defined in the [public/config.json] file and defaults to `http://localhost:8080`.

The default configuration is convenient for local development using the `dev/fdp-ui` stack from the [FAIRDataTeam/compose] repository.
However, it is also possible to override the default [public/config.json] file locally, if desired.
This can be achieved by creating a `public/config.local.json` file.
If such a file exists, it is picked up automatically by the Vite development server.

For example, you could use this to point the UI to an actual FDP on the web, as follows:

```yaml
# public/config.local.json
{ 'apiEndpointUrl': 'https://app.fairdatapoint.org' }
```

Note that the `config.local.json` file is ignored by `git`.

[FAIRDataPoint-client]: https://github.com/FAIRDataTeam/FAIRDataPoint-client
[FDP 1.2 specification]: https://specs.fairdatapoint.org
[FAIRDataTeam/compose]: https://github.com/FAIRDataTeam/compose/tree/master/fdp/ephemeral/v1/dev/fdp-ui
[npm]: https://docs.npmjs.com/cli/v11/commands
[npm clean-install]: https://docs.npmjs.com/cli/v11/commands/npm-ci
[npm install]: https://docs.npmjs.com/cli/v11/commands/npm-install
[Vue.js quickstart]: https://vuejs.org/guide/quick-start.html
[package.json]: ./package.json
[public/config.json]: ./public/config.json
[vite development server]: https://vite.dev/guide/cli#dev-server
[dotenv]: https://github.com/motdotla/dotenv
[vite docs]: https://vite.dev/guide/env-and-mode#env-files
[fairdata/fairdatapoint-ui]: https://hub.docker.com/r/fairdata/fairdatapoint-ui
[Nginx hardened image]: https://hub.docker.com/hardened-images/catalog/dhi/nginx
[Docker Compose]: https://docs.docker.com/compose/
[Fetch API]: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
[releases]: https://github.com/FAIRDataTeam/FAIRDataPoint-UI/releases
