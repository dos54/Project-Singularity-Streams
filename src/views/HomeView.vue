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

        <!-- Mobile drawer for members -->
    <v-navigation-drawer
      v-model="membersDrawer"
      location="left"
      temporary
      class="d-md-none"
      width="384"
    >
      <v-toolbar flat>
        <v-toolbar-title>Members</v-toolbar-title>
        <v-spacer />
        <v-btn icon @click="membersDrawer = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>

      <v-divider />

      <v-list>
        <v-list-item
          v-for="member in sortedMembers"
          :key="member.alias"
        >
          <MemberList :user="member" />
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-row>
      <v-col cols="4" class="d-none d-md-block">
        <h2>Members</h2>
        <ul class="list">
          <li v-for="member in sortedMembers" :key="member.alias">
            <MemberList :user="member" />
          </li>
        </ul>
      </v-col>

      <v-col cols="12" md="8">
        <!-- Mobile: button to open drawer -->
        <div class="d-flex justify-start mb-4 d-md-none">
          <v-btn
            variant="outlined"
            color="primary"
            @click="membersDrawer = true"
          >
            Show Members
          </v-btn>
        </div>

        <section>
          <h2>Currently Streaming</h2>
          <div v-if="streamingMembers.length === 0">Sorry, no one is streaming at the moment</div>
          <ul v-else class="list">
            <li v-for="member in streamingMembers" :key="member.alias">
              <StreamingList :user="member" />
            </li>
          </ul>
          <div v-if="isFetchingStatus">Loading Twitch status...</div>
          <div v-else-if="statusError">Failed to load stream data.</div>
        </section>
        <br />
        <section>
          <h2>
            Latest Videos
          </h2>
          <div v-if="sortedMembers.length === 0">
            There appears to be no members...
          </div>
          <ul v-else class="list">
            <li v-for="item in memberStore.membersByLatestUpload" :key="item.video.videoId">
              <NewVideoList :item="item" />
            </li>
          </ul>
        </section>

      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMemberStore } from '@/stores/member.store'
import StreamingList from '@/components/StreamingList.vue'
import MemberList from '@/components/MemberList.vue'
import NewVideoList from '@/components/NewVideoList.vue'

const memberStore = useMemberStore()
const { sortedMembers, isFetchingStatus, statusError, streamingMembers } = storeToRefs(memberStore)
const baseUrl = import.meta.env.BASE_URL
const membersDrawer = ref(false)

onMounted(async () => {
  memberStore.refreshStatus()
  memberStore.fetchLatestUploads()
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
