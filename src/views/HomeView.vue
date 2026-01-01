<template>
  <v-container fluid>
    <v-row>
      <v-img src="/project-singularity.png" max-width="1000" class="ma-auto fade-edges hero-img" />
    </v-row>

    <!-- Mobile drawer for members -->
    <v-navigation-drawer
      v-model="membersDrawer"
      location="left"
      temporary
      class="d-md-none drawer-75"
      width="300"
    >
      <v-toolbar flat>
        <v-toolbar-title>Members</v-toolbar-title>
        <v-spacer />
        <v-btn icon @click="membersDrawer = false">
          <v-icon icon="fa-regular fa-circle-xmark" />
        </v-btn>
      </v-toolbar>

      <v-divider />

      <v-list>
        <v-list-item v-for="member in sortedMembers" :key="member.memberId">
          <MemberList :user="member" />
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-row>
      <v-col cols="4" class="d-none d-md-block">
        <h2>Members</h2>
        <ul class="list">
          <li v-for="member in sortedMembers" :key="member.memberId">
            <MemberList :user="member" />
          </li>
        </ul>
      </v-col>

      <v-col cols="12" md="8">
        <!-- Mobile: button to open drawer -->
        <div class="d-flex justify-start mb-4 d-md-none">
          <v-btn variant="outlined" color="primary" @click="membersDrawer = true">
            Show Members
          </v-btn>
        </div>

        <section>
          <h2>Currently Streaming</h2>
          <v-switch
            v-model="onlyProjectSingularityStreams"
            label="[EXPERIMENTAL] Only Show Project Singularity Streams"
          ></v-switch>

          <div v-if="loading">Loading streaming status...</div>
          <div v-else-if="error">Failed to load stream data.</div>
          <div v-else-if="filteredStreamingMembers.length === 0">No streams found.</div>

          <ul v-else class="list">
            <li v-for="member in filteredStreamingMembers" :key="member.memberId">
              <StreamingList :user="member" />
            </li>
          </ul>
        </section>

        <br />

        <section>
          <h2>Latest Videos</h2>
          <v-switch
            v-model="onlyProjectSingularity"
            label="[EXPERIMENTAL] Only Show Project Singularity Videos"
          ></v-switch>

          <div v-if="loading && filteredUploads.length === 0">Loading videos...</div>
          <div v-else-if="filteredUploads.length === 0">
            Either there was a problem, or there are no uploads.
          </div>

          <ul v-else class="list">
            <li v-for="video in filteredUploads.slice(0, 10)" :key="video.videoId">
              <NewVideoList :video="video" />
            </li>
          </ul>
        </section>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMemberStore } from '@/stores/member.store'

import StreamingList from '@/components/StreamingList.vue'
import MemberList from '@/components/MemberList.vue'
import NewVideoList from '@/components/NewVideoList.vue'

const membersDrawer = ref(false)

const memberStore = useMemberStore()
const { sortedMembers, streamingMembers, loading, error, uploads } = storeToRefs(memberStore)

const onlyProjectSingularity = ref(true)
const onlyProjectSingularityStreams = ref(true)

const filteredStreamingMembers = computed(() => {
  if (!onlyProjectSingularityStreams.value) {
    return streamingMembers.value
  }

  const twitchStreams = streamingMembers.value.filter((member) => member.twitchStream?.isLive)

  const ytStreamers = streamingMembers.value.filter((member) => {
    const yt = member.latestYoutubeVideo
    if (!yt) return false
    return yt.state === 'live' && yt.isProjectSingularity
  })

  return { ...ytStreamers, ...twitchStreams }
})

const filteredUploads = computed(() => {
  const base = uploads.value
  if (!onlyProjectSingularity.value) return base
  return base.filter((v) => v.isProjectSingularity)
})

onMounted(async () => {
  await memberStore.hydrate()
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
  mask-image: linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}

.hero-img {
  height: 550px;
}

.drawer-75 {
  max-width: 75% !important;
}

@media (max-width: 600px) {
  .hero-img {
    height: 220px;
  }
}
</style>
