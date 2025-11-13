<template>
  <v-app>
    <!-- <v-app-bar
    app
    absolute
    scroll-threshold="1024"
    >
    </v-app-bar> -->

    <v-main class="d-flex">
      <RouterView />
    </v-main>

    <v-footer app class="pa-4">
      <div class="github-link">
        <span>Suggestions? Ideas? Reach out on&nbsp;</span>
        <a
          href="https://github.com/dos54/Project-Singularity-Streams"
          target="_blank"
          rel="noopener"
        >
          GitHub
          <v-icon icon="fa-brands fa-github" />
        </a>
      </div>
    </v-footer>
  </v-app>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<style scoped>
.header-banner {
  background-image: url('/project-singularity.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
</style>
