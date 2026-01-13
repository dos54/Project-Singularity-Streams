<template>
  <v-container fluid class="container">
    <v-card variant="elevated" color="error" class="card">
      <v-card-title class="card-title">404</v-card-title>
      <v-card-subtitle class="card-subtitle">
        Sorry, that page does not appear to exist.
      </v-card-subtitle>
      <v-card-actions class="buttons-container">
        <v-btn to="/">Go Back to Safety</v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0 auto;
  max-width: 600px;
  height: 300px;
}

.card-title {
  text-align: center;
  font-size: 3rem;
}

.card-subtitle {
  text-align: center;
}

.buttons-container {
  display: flex;
  justify-content: center;
}
</style>
