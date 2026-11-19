import React, { useState } from 'react';
import { Mic, MicOff, Radio, Send, Volume2 } from 'lucide-react';
import type { MicPermissionState } from '../hooks/useVoiceChat';
import type { ClientVisiblePlayer, VoiceChannel } from '../game/types';

interface VoiceCommsPanelProps {
  selfPlayer: ClientVisiblePlayer | null;
  players: ClientVisiblePlayer[];
  micPermission: MicPermissionState;
  muted: boolean;
  speaking: boolean;
  channel: VoiceChannel;
  audioLevel: number;
  pushToTalk: boolean;
  onSetPushToTalk: (val: boolean) => void;
  onToggleMute: () => void;
  onSwitchChannel: (channel: VoiceChannel) => void;
  onPTTActive: (active: boolean) => void;
  onSendChat: (text: string) => void;
}

const QUICK_CALLOUTS_SURVIVOR = [
  'Regroup on Medic!',
  'Quarantine Barrier up!',
  '2m Sweep soon — spread out!',
  'Zombies flanking north!',
];

const QUICK_CALLOUTS_ZOMBIE = [
  'Survivor ping spotted!',
  'Cutting off west trail!',
  'Tank pushing barrier!',
  'Blackout ambush ready!',
];

export function VoiceCommsPanel({
  selfPlayer,
  players,
  micPermission,
  muted,
  speaking,
  channel,
  audioLevel,
  pushToTalk,
  onSetPushToTalk,
  onToggleMute,
  onSwitchChannel,
  onPTTActive,
  onSendChat,
}: VoiceCommsPanelProps) {
  const [chatText, setChatText] = useState('');

  const isZombie = selfPlayer?.team === 'zombie';
  const callouts = isZombie ? QUICK_CALLOUTS_ZOMBIE : QUICK_CALLOUTS_SURVIVOR;

  const channelPeers = players.filter((p) => {
    if (channel === 'all') return true;
    return p.team === selfPlayer?.team;
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChatText('');
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">
      <div className="pb-3 border-b border-white/10">
        <h2 className="font-display text-lg font-bold tracking-wide text-white">
          Tactical Voice Comms
        </h2>
        <p className="text-xs text-slate-400">
          Real-time WebRTC audio radio for squad coordination
        </p>
      </div>

      {/* Radio Channel Switcher */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-300">Radio Frequency</span>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0d1217] border border-white/10">
          <button
            type="button"
            onClick={() => onSwitchChannel('team')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              channel === 'team'
                ? isZombie
                  ? 'bg-red-600 text-white'
                  : 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {isZombie ? 'Horde Only' : 'Survivors Only'}
          </button>
          <button
            type="button"
            onClick={() => onSwitchChannel('all')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              channel === 'all'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Players
          </button>
        </div>
      </div>

      {/* Microphone Control Deck */}
      <div className="p-4 rounded-xl bg-[#0d1217] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-4 h-4 ${!muted ? 'text-emerald-400' : 'text-slate-500'}`}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-slate-100">
              {muted ? 'Mic Muted' : speaking ? 'Transmitting Voice' : 'Mic Live'}
            </span>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={pushToTalk}
              onChange={(e) => onSetPushToTalk(e.target.checked)}
              className="rounded accent-emerald-500"
            />
            Push-to-Talk
          </label>
        </div>

        {/* Live Audio Meter */}
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ${
              speaking ? 'bg-emerald-400' : 'bg-slate-500'
            }`}
            style={{ width: `${muted ? 0 : Math.max(4, audioLevel)}%` }}
          />
        </div>

        {pushToTalk ? (
          <button
            type="button"
            onMouseDown={() => onPTTActive(true)}
            onMouseUp={() => onPTTActive(false)}
            onMouseLeave={() => onPTTActive(false)}
            onTouchStart={() => onPTTActive(true)}
            onTouchEnd={() => onPTTActive(false)}
            className={`w-full min-h-[48px] rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              speaking
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
            }`}
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
            Hold to Transmit
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleMute}
            className={`w-full min-h-[48px] rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              muted
                ? 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            {muted ? (
              <>
                <MicOff className="w-4 h-4" aria-hidden="true" />
                Unmute Microphone
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" aria-hidden="true" />
                Mute Microphone
              </>
            )}
          </button>
        )}

        {(micPermission === 'denied' || micPermission === 'unavailable') && (
          <p className="text-xs text-amber-300 leading-relaxed">
            Microphone access is unavailable in this browser session. You can still listen to teammates and send tactical radio callouts below.
          </p>
        )}
      </div>

      {/* Connected Channel Roster */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-300">
          On Channel ({channelPeers.length})
        </span>
        <div className="divide-y divide-white/5 rounded-xl bg-[#0d1217] border border-white/10 overflow-hidden">
          {channelPeers.map((peer) => (
            <div
              key={peer.id}
              className="px-3.5 py-2.5 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Volume2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    peer.voiceSpeaking
                      ? 'text-emerald-400'
                      : peer.voiceMuted
                        ? 'text-slate-600'
                        : 'text-slate-300'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-slate-100 font-medium truncate">
                  {peer.name}
                  {peer.id === selfPlayer?.id ? ' (You)' : ''}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                {peer.voiceSpeaking
                  ? 'Speaking'
                  : peer.voiceMuted
                    ? 'Muted'
                    : 'Listening'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Tactical Radio Callouts */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-300">
          Quick Radio Callouts
        </span>
        <div className="grid grid-cols-2 gap-2">
          {callouts.map((msg) => (
            <button
              key={msg}
              type="button"
              onClick={() => onSendChat(msg)}
              className="min-h-[40px] px-2.5 py-2 rounded-lg bg-[#0d1217] hover:bg-white/10 border border-white/10 text-left text-xs text-slate-200 cursor-pointer"
            >
              {msg}
            </button>
          ))}
        </div>

        <form onSubmit={handleSend} className="flex gap-2 pt-1">
          <input
            type="text"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Send radio dispatch..."
            aria-label="Send radio dispatch"
            className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-[#0d1217] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={!chatText.trim()}
            aria-label="Send radio message"
            className="min-h-[40px] min-w-[44px] px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 flex items-center justify-center cursor-pointer"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
