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
const buildDate = import.meta.env.VITE_BUILD_DATE ?? ''
</script>

<style scoped>
.main-container {
  position: relative;
  isolation: isolate;
  padding-top: 0;
}
.main-container::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  /* Toolbar collapse changes the visible viewport, not this stable image canvas. */
  height: 100vh;
  height: 100lvh;
  z-index: -1;
  pointer-events: none;
  background-image: url('/bubble-nebula.jpg');
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
.main-container::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: clamp(400px, 70vw, 650px);
  z-index: -1;
  pointer-events: none;
  /* Scroll with the hero; keep separate from the swappable background image. */
  background: linear-gradient(
    to bottom,
    #0c0918 0%,
    #0c0918 45%,
    rgb(12 9 24 / 94%) 60%,
    rgb(12 9 24 / 62%) 78%,
    rgb(12 9 24 / 0%) 100%
  );
}
</style>
