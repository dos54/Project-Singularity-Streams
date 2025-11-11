<template>
  <v-container fluid class="main-container">
    <header>
      This is NOT an official Project Singularity website.
    </header>
    <RouterView />
    <footer>
      <div>
        Background image © ESA/Hubble & NASA, used under CC BY 4.0 license.
        <a href="https://esahubble.org/images/heic1608a">
          NASA, ESA, Hubble Heritage Team
        </a>
      </div>
      <div>
        This is NOT an official Project Singularity website.
      </div>
    </footer>
  </v-container>
</template>

<script setup lang="ts">
// import { ref } from 'vue'
// import { RouterView } from 'vue-router'
// import { useRoute } from 'vue-router'

// const route = useRoute()

// const title = ref(route.meta.title || '')
</script>

<style scoped>
.main-container {
  background-image: url('/bubble-nebula.jpg');
  background-position: center;
  background-size: cover;
}
</style>
