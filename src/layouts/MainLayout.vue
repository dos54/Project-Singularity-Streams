<template>
  <v-container fluid class="main-container">
    <RouterView />
    <footer>
      <div>
        Background image © ESA/Hubble & NASA, used under CC BY 4.0 license.
        <a href="https://esahubble.org/images/heic1608a"> NASA, ESA, Hubble Heritage Team </a>
      </div>
      <div>This is NOT an official Project Singularity website.</div>

      <div class="build-date">Last updated: {{ buildDate }}</div>
    </footer>
  </v-container>
</template>

<script setup lang="ts">
// import { ref } from 'vue'
// import { RouterView } from 'vue-router'
// import { useRoute } from 'vue-router'

// const route = useRoute()

// const title = ref(route.meta.title || '')

const buildDate = import.meta.env.VITE_BUILD_DATE ?? ''
</script>

<style scoped>
.main-container {
  background-image: url('/bubble-nebula.jpg');
  background-position: center;
  background-size: cover;
}
</style>
