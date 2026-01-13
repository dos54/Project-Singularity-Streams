<template>
  <v-card variant="elevated" color="primary">
    <v-card-title>
      {{ team.teamName }}
    </v-card-title>
    <v-card-subtitle>
      Subtitles
    </v-card-subtitle>
  </v-card>
</template>

<script setup lang="ts">
import type { Team } from '@/types/team';

defineProps<{
 team: Team
}>()
</script>
