<script setup lang="ts">
import { ref } from 'vue'
import { useResourceView } from '../composables/useResourceView'

const {
  loading,
  error,
  node,
  title,
  description,
  breadcrumbs,
  metadataRows,
  unknownMetadataRows,
  childSections,
  childSummaries,
  internalHref,
} = useResourceView()

const showUnknown = ref(false)
</script>

<template>
  <div>
    <nav v-if="node && breadcrumbs.length > 1" class="breadcrumbs" aria-label="Breadcrumb">
      <div class="breadcrumbs__inner">
        <template v-for="(item, index) in breadcrumbs" :key="item.uri">
          <router-link
            v-if="index < breadcrumbs.length - 1"
            :to="internalHref(item.uri)"
            class="breadcrumb-link"
            >{{ item.text }}</router-link
          >
          <span v-else class="breadcrumb-current">{{ item.text }}</span>
          <span v-if="index < breadcrumbs.length - 1" class="breadcrumb-sep">/</span>
        </template>
      </div>
    </nav>

    <main class="page-container">
      <p v-if="loading">Loading…</p>
      <p v-else-if="error">Error: {{ error }}</p>
      <template v-else-if="node">
        <h1 v-if="title">{{ title }}</h1>
        <p v-if="description">{{ description }}</p>

        <section v-if="metadataRows.length > 0" class="metadata-table">
          <div v-for="row in metadataRows" :key="row.predicate" class="metadata-row">
            <div class="metadata-label">{{ row.label }}</div>
            <div class="metadata-value">
              <template v-if="row.kind === 'literal'">
                <div v-for="value in row.values" :key="value.text">{{ value.text }}</div>
              </template>

              <template v-else-if="row.kind === 'blank-node'">
                <div
                  v-for="(bnProps, bnIndex) in row.blankNodes"
                  :key="bnIndex"
                  class="blank-node-card"
                >
                  <div v-for="prop in bnProps" :key="prop.label" class="blank-node-row">
                    <span class="blank-node-label">{{ prop.label }}</span>
                    <span class="blank-node-value">
                      <template v-for="val in prop.values" :key="val.text">
                        <a
                          v-if="val.href && !val.internal"
                          :href="val.href"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-link"
                          >{{ val.text }}</a
                        >
                        <router-link
                          v-else-if="val.href && val.internal"
                          :to="internalHref(val.href)"
                          class="text-link"
                          >{{ val.text }}</router-link
                        >
                        <span v-else>{{ val.text }}</span>
                      </template>
                    </span>
                  </div>
                </div>
              </template>

              <template v-else>
                <ul>
                  <li v-for="value in row.values" :key="value.href">
                    <a
                      v-if="!value.internal"
                      :href="value.href"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-link"
                      >{{ value.text }}</a
                    >
                    <router-link
                      v-else-if="value.href"
                      :to="internalHref(value.href)"
                      class="text-link"
                      >{{ value.text }}</router-link
                    >
                  </li>
                </ul>
              </template>
            </div>
          </div>
        </section>

        <template v-if="unknownMetadataRows.length > 0">
          <button type="button" class="unknown-toggle" @click="showUnknown = !showUnknown">
            {{
              showUnknown
                ? `Hide non-DASH rows (${unknownMetadataRows.length})`
                : `Show non-DASH rows (${unknownMetadataRows.length})`
            }}
          </button>

          <section v-if="showUnknown" class="metadata-table">
            <div v-for="row in unknownMetadataRows" :key="row.predicate" class="metadata-row">
              <div class="metadata-label">{{ row.label }}</div>
              <div class="metadata-value">
                <template v-if="row.kind === 'literal'">
                  <div v-for="value in row.values" :key="value.text">{{ value.text }}</div>
                </template>

                <template v-else-if="row.kind === 'blank-node'">
                  <div
                    v-for="(bnProps, bnIndex) in row.blankNodes"
                    :key="bnIndex"
                    class="blank-node-card"
                  >
                    <div v-for="prop in bnProps" :key="prop.label" class="blank-node-row">
                      <span class="blank-node-label">{{ prop.label }}</span>
                      <span class="blank-node-value">
                        <template v-for="val in prop.values" :key="val.text">
                          <a
                            v-if="val.href && !val.internal"
                            :href="val.href"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-link"
                            >{{ val.text }}</a
                          >
                          <router-link
                            v-else-if="val.href && val.internal"
                            :to="internalHref(val.href)"
                            class="text-link"
                            >{{ val.text }}</router-link
                          >
                          <span v-else>{{ val.text }}</span>
                        </template>
                      </span>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <ul>
                    <li v-for="value in row.values" :key="value.href">
                      <a
                        v-if="!value.internal"
                        :href="value.href"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-link"
                        >{{ value.text }}</a
                      >
                      <router-link
                        v-else-if="value.href"
                        :to="internalHref(value.href)"
                        class="text-link"
                        >{{ value.text }}</router-link
                      >
                    </li>
                  </ul>
                </template>
              </div>
            </div>
          </section>
        </template>

        <section v-for="section in childSections" :key="section.label" class="child-section">
          <h2 class="section-title">{{ section.label }}</h2>
          <div class="child-list">
            <article v-for="uri in section.items" :key="uri" class="child-card">
              <router-link :to="internalHref(uri)" class="child-card__title">
                {{ childSummaries[uri]?.title ?? uri }}
              </router-link>
              <p v-if="childSummaries[uri]?.description" class="child-card__description">
                {{ childSummaries[uri].description }}
              </p>
            </article>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
