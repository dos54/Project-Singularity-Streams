/*===============================================
File: members.ts
Author: dos54
Date: November 10, 2025
Purpose: Provide a list of server members
===============================================*/
export interface Member {
  alias: string
  twitch?: string
  youtube?: string
  discord?: string
}

export const members: Member[] = [
  {
    alias: 'Ducked',
    twitch: 'duckedgtnh',
    youtube: '@DuckedGTNH',
    discord: 'discord.gg/ufa5xm9PK7',
  },
  {
    alias: 'Neurotic Goose',
    youtube: '@NeuroticGoose',
    discord: 'discord.gg/ufa5xm9PK7',
  },
  {
    alias: 'Hecuba',
    youtube: '@hecuba39',
  },
  {
    alias: 'HamCorp (Tooj)',
    youtube: '@ham-corp',
  },
  {
    alias: 'soycake',
    youtube: '@soycake',
  },
  {
    alias: '3ricbae',
    youtube: '@3ricbae',
  },
  {
    alias: 'Dragonium',
    youtube: '@dragonium10190',
  },
  {
    alias: 'ChiefLogan',
    youtube: '@chieflogan_',
  },
  {
    alias: 'Jetlagg',
    youtube: '@jetlaggmc',
  },
  {
    alias: 'Jolliwog',
    youtube: '@jolliwog',
  },
  {
    alias: 'Sol IX',
    twitch: 'sol_ix',
    youtube: '@IX_Streams',
    discord: 'discord.com/invite/mEUV7fwdfF',
  },
  {
    alias: 'Mastiox',
    twitch: 'mastiox',
    youtube: '@Mastiox',
  },
  {
    alias: 'Flurben',
    twitch: 'flurbenlive',
  },
  {
    alias: 'Glistew',
    twitch: 'glistew',
  },
]
