# FAIR Data Point client redux

A browser-based client for FAIR Data Point (FDP) administration.

> [!NOTE]
> This client replaces the [legacy FDP client], which has been archived.

<!-- TODO: Change the original client repository status to "Archived" on GitHub -->

## Background

### FAIR principles

The [FAIR principles] aim to make _data_ more **F**indable, **A**ccessible, **I**nteroperable, and **R**eusable.

### FAIR Data Point (FDP)

#### Purpose

A FAIR Data Point (FDP) is a tool for the publication of **_metadata_** describing datasets in a standardized form that unlocks the powers of [Semantic Web] technology.
The FDP uses the Resource Description Framework ([RDF]) and the Data Catalog Vocabulary ([DCAT]) to facilitate publication of metadata as [Linked (Open) Data], following the [FAIR principles].

[RDF] describes _things_ using statements of the form `(<subject>, <predicate>, <object>)`, called triples.
By storing metadata, in the form of RDF, in a [triple store], a type of graph database specialized for handling [RDF], the we gain the ability to perform advanced queries using the [SPARQL] query language.

Due to the use of [Semantic Web] technology, metadata published on an FDP becomes part of a world wide web of knowledge.
This enables people and machines from around the globe to explore the metadata and discover relations between different datasets using logical inference and reasoning techniques.

#### Specification

The requirements for the [RDF] representation of FAIR Data Point metadata are defined in the [FDP 1.2 specification].
Compliance with the [FDP 1.2 specification] specification implies the following:

1. The FDP root URL must resolve to a metadata description of the FDP itself as a [DCAT] `MetadataService`.
   This description must include a link to the FDP's primary API endpoint, indicated by `dcat:endpointURL`.
2. The FDP must expose metadata in the form of [RDF], supporting at least the [Turtle] (default) and [JSON-LD] representations.
3. Each metadata record on an FDP should be linked to a "profile" which points to a metadata schema, expressed in the Shapes Constraint Language ([SHACL]), that can be used for validation.
4. FDP metadata schemas must have (a subclass of) [DCAT] `Resource` as the target class.
5. The FDP metadata must include Linked Data Platform ([LDP]) containment statements.

The [FDP 1.2 specification] also mentions that the FDP must provide an API following REST guidelines so that a client is able to discover the available actions and access the resources it needs.

#### Reference implementation and API

The [FDP reference implementation] is a Java-based implementation of the [FDP 1.2 specification] that provides an HTTP API for manipulating and querying RDF metadata.
This enables users, like data stewards, to build automated metadata publication workflows for the FDP.
The FDP API is intended primarily for machine interaction and exposes machine-readable documentation based on the [OpenAPI 3 spec].

However, direct human interaction with the FDP API can be a bit cumbersome.
To simplify direct human interaction with the FDP API, we offer the FDP client.

## FAIR Data Point Client (FDP client)

The FAIR Data Point Client (FDP client) is a JavaScript (TypeScript) application that runs entirely in the browser, without any server-side rendering.
The client provides a web interface that makes it easier for humans to interact with the FAIR Data Point by hiding the interactions with the FDP API.
The main goal of the FDP client is to enable basic administration of the FDP, inspection of FDP content, and execution of simple queries.

> [!NOTE]
> The FDP client was not designed for bulk operations or advanced queries.
> Those are best performed by direct interaction with the FDP API.

### Quickstart

The FDP client is published as a Docker image ([fairdata/fairdatapoint-client-redux]) and is designed to run in a container.
The Docker image is based on the official [Nginx hardened image], configured as a static file server listening on port `8080`.

One way to deploy the client is using [Docker Compose], as follows:

```yaml
# compose.yaml
services:
  fdp-client-redux:
    image: fairdata/fairdatapoint-client-redux
    # ...
    volumes:
      # Override the default runtime config to specify the URL of the FDP API
      - './my.config.json:/usr/share/nginx/html/config.json'
```

where `my.config.json` is a custom runtime configuration file that defines the primary endpoint URL of the FDP API, for example:

```yaml
# my.config.json
{ apiEndpointUrl: https://fdp.example.org }
```

It is also possible to run the FDP client application from source, but this is only recommended for development purposes.

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

The browser-based client application needs an API, provided by a FAIR Data Point (FDP), to function properly.
The URL for the primary API endpoint is defined in the [public/config.json] file and defaults to `http://localhost:8080`.

The default configuration is convenient for local development using the `dev/fdp-client-redux` stack from the [FAIRDataTeam/compose] repository.
However, it is also possible to override the default [public/config.json] file locally, if desired.
This can be achieved by creating a `public/config.local.json` file.
If such a file exists, it is picked up automatically by the Vite development server.

For example, you could use this to point the client to an actual FDP on the web, as follows:

```yaml
# public/config.local.json
{ 'apiEndpointUrl': 'https://app.fairdatapoint.org' }
```

Note that the `config.local.json` file is ignored by `git`.

[FDP reference implementation]: https://github.com/FAIRDataTeam/FAIRDataPoint
[legacy FDP client]: https://github.com/FAIRDataTeam/FAIRDataPoint-client
[FDP 1.2 specification]: https://specs.fairdatapoint.org
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
[fairdata/fairdatapoint-client-redux]: https://hub.docker.com/r/fairdata/fairdatapoint-client-redux
[RDF]: https://www.w3.org/TR/rdf12-primer/
[DCAT]: https://www.w3.org/TR/vocab-dcat-3/
[SPARQL]: https://www.w3.org/TR/sparql11-query/
[Linked (Open) Data]: https://www.w3.org/DesignIssues/LinkedData
[FAIR principles]: https://doi.org/10.1038/sdata.2016.18
[Nginx hardened image]: https://hub.docker.com/hardened-images/catalog/dhi/nginx
[triple store]: https://opendatahandbook.org/glossary/en/terms/triple-store/
[Semantic Web]: https://www.w3.org/2001/sw/SW-FAQ
[Turtle]: https://www.w3.org/TR/rdf12-turtle/
[JSON-LD]: https://json-ld.org/primer/latest/
[SHACL]: https://www.w3.org/TR/shacl/
[LDP]: https://www.w3.org/TR/ldp/
[OpenAPI 3 spec]: https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
[REST]: https://roy.gbiv.com/pubs/dissertation/rest_arch_style.htm
[Docker Compose]: https://docs.docker.com/compose/
