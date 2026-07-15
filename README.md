# FAIR Data Point client redux

A browser-based client for administration of the FAIR Data Point reference implementation ([FAIRDataPoint]).

This client replaces the original [FAIRDataPoint-client].

<!-- TODO: Change the original client repository status to "Archived" on GitHub -->

## Setting up a development machine

### Dependencies and development server

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

### App configuration for development

The browser-based client application needs an API, provided by a FAIR Data Point (FDP), to function properly.
The URL for the primary API endpoint is defined in the [public/config.json] file and defaults to `http://localhost:8080`.

The default configuration is convenient for local development using the `dev/fdp-client-redux` stack from the [FAIRDataTeam/compose] repository.
However, it is also possible to override the default [public/config.json] file locally, if desired.
This can be achieved by creating a `public/config.local.json` file.
If such a file exists, it is picked up automatically by the Vite development server.

For example, you could use this to point the client to an actual FDP on the web, as follows:

#### public/config.local.json

```json
{
  "apiEndpointUrl": "https://app.fairdatapoint.org"
}
```

Note that the `config.local.json` file is ignored by `git`.

[FAIRDataPoint]: https://github.com/FAIRDataTeam/FAIRDataPoint
[FAIRDataPoint-client]: https://github.com/FAIRDataTeam/FAIRDataPoint-client
[FAIRDataTeam/compose]: https://github.com/FAIRDataTeam/compose/tree/master/fdp/ephemeral/v1/dev/fdp-client-redux
[npm]: https://docs.npmjs.com/cli/v11/commands
[npm clean-install]: https://docs.npmjs.com/cli/v11/commands/npm-ci
[npm install]: https://docs.npmjs.com/cli/v11/commands/npm-install
[Vue.js quickstart]: https://vuejs.org/guide/quick-start.html
[package.json]: ./package.json
[public/config.json]: ./public/config.json
[vite development server]: https://vite.dev/guide/cli#dev-server
[dotenv]: https://github.com/motdotla/dotenv
[vite docs]: https://vite.dev/guide/env-and-mode#env-files
