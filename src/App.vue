<template>
  <v-app>
    <v-app-bar
    color="primary"
    app
    image="/project-singularity.png"
    height="512"
    absolute
    scroll-behavior="fade-image"
    scroll-threshold="1024"
    >
    <!-- <template v-slot:title>
      <h1>Project Singularity</h1>
    </template> -->
    </v-app-bar>

    <v-main class="d-flex">
      <RouterView />
    </v-main>

    <v-footer
      app
      class="pa-4"
    >
      <!-- <p>footer</p> -->
    </v-footer>
  </v-app>

</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<style scoped></style>
