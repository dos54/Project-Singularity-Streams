<template>
  <v-container fluid>
    <h1 class="title">{{ title }}</h1>
    <RouterView />
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RouterView } from 'vue-router'
import { useRoute } from 'vue-router'

const route = useRoute()

const title = ref(route.meta.title || '')
</script>

<style scoped>
.title {
  
}
</style>
