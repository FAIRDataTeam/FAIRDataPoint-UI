<script setup lang="ts">
import { useResourceView } from '../composables/useResourceView'

const {
  loading,
  error,
  node,
  title,
  description,
  breadcrumbs,
  metadataRows,
  childSections,
  childSummaries,
  internalHref,
} = useResourceView()
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
              <div v-for="value in row.values" :key="value">{{ value }}</div>
            </div>
          </div>
        </section>

        <section v-for="section in childSections" :key="section.label" class="child-section">
          <h2 class="section-title">{{ section.label }}</h2>
          <div class="child-list">
            <article v-for="uri in section.uris" :key="uri" class="child-card">
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
