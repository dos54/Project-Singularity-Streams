<template>
  <v-app>
    <!-- <v-app-bar app flat>
    </v-app-bar> -->

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
