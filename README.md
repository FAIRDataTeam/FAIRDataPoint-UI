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


[FAIRDataPoint]: https://github.com/FAIRDataTeam/FAIRDataPoint
[FAIRDataPoint-client]: https://github.com/FAIRDataTeam/FAIRDataPoint-client
[npm]: https://docs.npmjs.com/cli/v11/commands
[npm clean-install]: https://docs.npmjs.com/cli/v11/commands/npm-ci
[npm install]: https://docs.npmjs.com/cli/v11/commands/npm-install
[Vue.js quickstart]: https://vuejs.org/guide/quick-start.html
[package.json]: ./package.json
[vite development server]: https://vite.dev/guide/cli#dev-server
[dotenv]: https://github.com/motdotla/dotenv
[vite docs]: https://vite.dev/guide/env-and-mode#env-files
