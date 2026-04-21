<script setup lang="ts">
import { ref } from 'vue'
import { useResourceView } from '../composables/useResourceView'
import { useRawFormat, formats } from '../composables/useRawFormat'
import 'prismjs/themes/prism.css'

const {
  loading,
  error,
  node,
  resourceUri,
  activeFormat,
  activeRawText,
  title,
  description,
  breadcrumbs,
  metadataRows,
  unknownMetadataRows,
  childSections,
  childSummaries,
  resourceLabel,
  internalHref,
} = useResourceView()

const showUnknown = ref(false)

const {
  shownFormat,
  rawLoading,
  rawContentHeight,
  startRawResize,
  highlightedRawContent,
  toggleFormat,
} = useRawFormat(resourceUri, activeFormat, activeRawText)
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
        <h1 v-if="title" class="resource-title">{{ title }}</h1>
        <p v-if="description" class="resource-description">{{ description }}</p>

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

        <section class="action-row">
          <span v-for="fmt in formats" :key="fmt.id" class="action-button-group">
            <button
              type="button"
              :class="[
                'action-button',
                {
                  'action-button--active':
                    shownFormat === fmt.id || (shownFormat === null && activeFormat === fmt.id),
                },
              ]"
              :title="shownFormat === fmt.id ? `Close ${fmt.label}` : `Show ${fmt.label} below`"
              @click="toggleFormat(fmt.id, fmt.accept)"
            >
              {{ fmt.label }}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="action-button__chevron"
                :class="{ 'action-button__chevron--open': shownFormat === fmt.id }"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <a
              :href="`${resourceUri}?format=${fmt.param}`"
              class="action-button action-button--icon"
              target="_blank"
              rel="noopener noreferrer"
              :title="`Open raw ${fmt.label} in a new tab`"
              >&#8599;</a
            >
          </span>
        </section>

        <section v-if="shownFormat" class="raw-section">
          <p v-if="rawLoading" class="raw-loading">Loading…</p>
          <pre
            v-else
            class="raw-content language-none"
            :style="{ height: rawContentHeight + 'px' }"
          ><code v-html="highlightedRawContent" /></pre>
          <div class="raw-resize-handle" @mousedown.prevent="startRawResize" />
        </section>

        <section v-for="section in childSections" :key="section.label" class="child-section">
          <h2 class="section-title">{{ section.label }}</h2>
          <div class="child-list">
            <article v-for="uri in section.items" :key="uri" class="child-card">
              <router-link :to="internalHref(uri)" class="child-card__title">
                {{ childSummaries[uri]?.title ?? resourceLabel(uri) }}
              </router-link>
              <div v-if="childSummaries[uri]?.description" class="child-card__description">
                {{ childSummaries[uri].description }}
              </div>
              <div v-if="childSummaries[uri]?.theme" class="child-card__badge-row">
                <a
                  :href="childSummaries[uri].theme"
                  class="child-card__badge"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ childSummaries[uri].theme?.split('/').filter(Boolean).pop() }}</a>
              </div>
              <div v-if="childSummaries[uri]" class="child-card__meta">
                <span v-if="childSummaries[uri].issued">
                  <span class="child-card__meta-label">Issued</span>
                  {{ childSummaries[uri].issued }}
                </span>
                <span v-if="childSummaries[uri].modified">
                  <span class="child-card__meta-label">Modified</span>
                  {{ childSummaries[uri].modified }}
                </span>
              </div>
            </article>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
