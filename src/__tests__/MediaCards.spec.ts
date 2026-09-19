import { beforeEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StreamingList from '../components/StreamingList.vue'
import NewVideoList from '../components/NewVideoList.vue'
import VideoThumbnail from '../components/VideoThumbnail.vue'
import MemberList from '../components/MemberList.vue'
import type { MemberWithComputed } from '../types/member'
import type { YoutubeVideo } from '../types/youtube'
import { useMemberStore } from '../stores/member.store'

const video: YoutubeVideo = { memberId: 1, videoId: 'live-id', title: 'YouTube stream', publishedAt: '2026-01-01T00:00:00Z', thumbnailUrl: 'https://example.test/youtube.jpg', isProjectSingularity: true, state: 'live' }
const user: MemberWithComputed = { memberId: 1, alias: 'Creator', twitch: 'creator', youtube: '@creator', youtubeId: 'channel-id', twitchStream: { login: 'creator', isLive: true, title: 'Twitch stream', gameName: 'Minecraft', viewerCount: 12, thumbnailUrl: 'https://example.test/twitch.jpg' }, latestYoutubeVideo: video }
const global = { stubs: { VCard: { template: '<article><slot /></article>' }, VCardTitle: { template: '<h3><slot /></h3>' }, VCardSubtitle: { template: '<div><slot /></div>' }, VCardText: { template: '<div><slot /></div>' }, VCardActions: { template: '<div><slot /></div>' }, VBtn: { template: '<a><slot /></a>' } } }
beforeEach(() => { setActivePinia(createPinia()) })

describe('video and streaming cards', () => {
  it('shows normalized Discord invites only for members with a valid link', async () => {
    const wrapper = mount(MemberList, { global, props: { user: { ...user, discordInvite: 'discord.gg/ufa5xm9PK7' } } })
    expect(wrapper.findAll('a').find(a => a.text() === 'Discord')?.attributes('href')).toBe('https://discord.gg/ufa5xm9PK7')
    await wrapper.setProps({ user: { ...user, discordInvite: 'discord.com/invite/mEUV7fwdfF' } })
    expect(wrapper.findAll('a').find(a => a.text() === 'Discord')?.attributes('href')).toBe('https://discord.com/invite/mEUV7fwdfF')
    await wrapper.setProps({ user: { ...user, discordInvite: null } })
    expect(wrapper.text()).not.toContain('Discord')
    await wrapper.setProps({ user: { ...user, discordInvite: 'javascript:alert(1)' } })
    expect(wrapper.text()).not.toContain('Discord')
  })
  it('links the creator and description URLs without expanding on link clicks or rendering HTML', async () => {
    useMemberStore().members = [user]
    const wrapper = mount(NewVideoList, { global, props: { video: { ...video, description: 'Visit https://example.org/page. <b>Text</b> javascript:alert(1)' } } })
    expect(wrapper.find('.creator-link').attributes('href')).toBe('https://www.youtube.com/channel/channel-id')
    expect(wrapper.find('.creator-link').text()).toBe('Creator')
    const link = wrapper.find('.description a')
    expect(link.attributes('href')).toBe('https://example.org/page')
    await link.trigger('click')
    expect(wrapper.find('button').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.description b').exists()).toBe(false)
    expect(wrapper.find('.description').text()).toContain('<b>Text</b>')
    expect(wrapper.findAll('.description a')).toHaveLength(1)
  })
  it('expands description text without navigating and collapses it again', async () => {
    const wrapper = mount(NewVideoList, { global, props: { video: { ...video, description: 'First line\nSecond line\nThird line\nMore details' } } })
    expect(wrapper.find('.description').classes()).toContain('collapsed')
    await wrapper.find('.description').trigger('click')
    expect(wrapper.find('button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.description').classes()).not.toContain('collapsed')
    expect(wrapper.findAll('.description-toggle')).toHaveLength(2)
    expect(wrapper.find('button a').exists()).toBe(false)
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('button').attributes('aria-expanded')).toBe('false')
  })
  it('only links Twitch when YouTube is not live, even if a channel and recent video exist', () => {
    const wrapper = mount(StreamingList, { global, props: { user: { ...user, latestYoutubeVideo: { ...video, state: 'video' } } } })
    expect(wrapper.findAll('a').every(a => a.attributes('href') === 'https://www.twitch.tv/creator')).toBe(true)
    expect(wrapper.find('img').attributes('src')).toBe('https://example.test/twitch.jpg')
    expect(wrapper.text()).not.toContain('YouTube stream')
  })
  it('links the live YouTube video, not the channel, and hides offline Twitch', () => {
    const wrapper = mount(StreamingList, { global, props: { user: { ...user, twitchStream: null } } })
    expect(wrapper.findAll('a').every(a => a.attributes('href') === 'https://www.youtube.com/watch?v=live-id')).toBe(true)
    expect(wrapper.text()).not.toContain('Twitch')
  })
  it('combines simultaneous streams into one preview with both platform links', () => {
    const wrapper = mount(StreamingList, { global, props: { user } })
    const previews = wrapper.findAll('.stream-preview')
    expect(previews).toHaveLength(1)
    expect(previews[0]!.text()).toBe('YouTube stream')
    expect(previews[0]!.attributes('href')).toContain('watch?v=live-id')
    expect(wrapper.findAll('a').map(a => a.attributes('href'))).toContain('https://www.twitch.tv/creator')
    expect(wrapper.findAll('img')).toHaveLength(1)
    expect(wrapper.text()).toContain('Live on YouTube and Twitch')
  })
  it('shows a thumbnail and direct watch destination for latest videos', () => {
    const wrapper = mount(NewVideoList, { global, props: { video: { ...video, state: 'video' } } })
    expect(wrapper.find('a').attributes('href')).toBe('https://www.youtube.com/watch?v=live-id')
    expect(wrapper.find('img').attributes('src')).toBe(video.thumbnailUrl)
  })
  it('handles missing or failed images and retries when the image changes', async () => {
    const wrapper = mount(VideoThumbnail, { props: { src: null, alt: 'Preview' } })
    expect(wrapper.text()).toBe('Preview unavailable')
    await wrapper.setProps({ src: 'https://example.test/first.jpg' })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.setProps({ src: 'https://example.test/new.jpg' })
    expect(wrapper.find('img').exists()).toBe(true)
  })
})
