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

    <!-- <v-footer
      app
      class="pa-4"
    >
    </v-footer> -->
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
