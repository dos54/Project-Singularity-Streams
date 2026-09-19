<template>
  <button
    type="button"
    class="refresh-button"
    :disabled="busy || seconds > 0 || disabled"
    :aria-label="
      busy
        ? `Refreshing ${label}`
        : seconds
          ? `Refresh ${label}: please wait ${seconds} seconds`
          : `Refresh ${label}`
    "
    :aria-busy="busy"
    @click="$emit('refresh')"
  >
    <svg v-if="busy" class="spinner" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
    </svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6M20 12l-3-5" />
    </svg>
    <span>{{ busy ? 'Refreshing…' : seconds > 0 ? `Please wait · ${seconds}s` : 'Refresh' }}</span>
  </button>
</template>
<script setup lang="ts">
defineProps<{ label: string; busy: boolean; seconds: number; disabled?: boolean }>()
defineEmits<{ refresh: [] }>()
</script>
<style scoped>
.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid #718087;
  border-radius: 8px;
  font-size: 0.85rem;
}
.refresh-button:disabled {
  opacity: 0.65;
  cursor: default;
}
.refresh-button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}
.spinner {
  animation: spin 0.8s linear infinite;
  stroke-dasharray: 42 16;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
