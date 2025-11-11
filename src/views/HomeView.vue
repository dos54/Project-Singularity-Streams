<template>
  <v-container fluid>
    <v-row>
      <v-img
        :src="baseUrl + '/project-singularity.png'"
        max-width="1000"
        cover
        class="ma-auto fade-edges"
      />
    </v-row>
    <v-row>
      <v-col cols="4">
        <h2>Members</h2>
        <ul class="list">
          <li v-for="member in sortedMembers" :key="member.alias">
            <MemberList :user="member" />
          </li>
        </ul>
      </v-col>
      <v-col cols="8">
        <h2>Live on Twitch</h2>
        <ul class="list">
          <li v-for="member in streamingMembers" :key="member.alias">
            <StreamingList :user="member" />
          </li>
        </ul>

        <div v-if="isFetchingTwitch">Loading Twitch status...</div>
        <div v-else-if="twitchError">Failed to load stream data.</div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMemberStore } from '@/stores/member.store'
import StreamingList from '@/components/StreamingList.vue'
import MemberList from '@/components/MemberList.vue'

const memberStore = useMemberStore()
const { sortedMembers, isFetchingTwitch, twitchError, streamingMembers } = storeToRefs(memberStore)
const baseUrl = import.meta.env.BASE_URL

onMounted(async () => {
  memberStore.fetchTwitchStreams()
})
</script>

<style scoped>
.list {
  list-style: none;
  width: 100%;
  display: grid;
  gap: 1rem;
}

.fade-edges {
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 20%,
    black 80%,
    transparent 100%
  );

  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}
</style>
