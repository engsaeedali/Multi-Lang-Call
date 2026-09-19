"use client";

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  LiveKitRoom, 
  useTracks,
  useDataChannel,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { Track, RemoteAudioTrack } from 'livekit-client';
import '@livekit/components-styles';

const LANGUAGES = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ru', label: 'Русский', dir: 'ltr' },
  { code: 'zh', label: '中文', dir: 'ltr' },
];

export default function JoinRoom({ params }: { params: Promise<{ roomId: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const username = searchParams.get('user') || 'Anonymous';
  const { roomId } = use(params);

  const [language, setLanguage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (language && username && roomId) {
      const fetchToken = async () => {
        try {
          const res = await fetch(`/api/token?roomName=${roomId}&participantName=${encodeURIComponent(username)}&language=${language}`);
          const data = await res.json();
          if (data.token) {
            setToken(data.token);
          } else {
            console.error('Error fetching token:', data.error);
          }
        } catch (error) {
          console.error('Failed to fetch token', error);
        }
      };
      fetchToken();
    }
  }, [language, username, roomId]);

  if (!language) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-gray-900">
        <div className="max-w-xl w-full bg-white p-8 rounded-2xl shadow-xl">
          <h2 className="text-3xl font-bold text-center mb-2">Select Your Language</h2>
          <p className="text-center text-gray-500 mb-8">Choose your primary language for the session</p>
          <div className="grid grid-cols-2 gap-4">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className="p-6 border-2 border-gray-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl font-bold">{lang.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
        <p className="text-xl">Connecting...</p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={false}
      audio={true}
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880'}
      data-lk-theme="default"
      style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      connect={true}
    >
      <div className="flex-1 p-4 bg-gray-50 flex flex-col h-full">
         <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow mb-4 text-black">
           <h2 className="text-xl font-bold">Room: {roomId}</h2>
           <div className="flex items-center gap-4">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                Your Language: {LANGUAGES.find(l => l.code === language)?.label}
              </span>
           </div>
         </div>
         <div className="flex-1 bg-white rounded-lg shadow p-4 overflow-y-auto">
           <TranscriptionView currentLanguage={language} />
         </div>
      </div>
      <RoomAudioRenderer />
      <AudioDucker />
    </LiveKitRoom>
  );
}

function TranscriptionView({ currentLanguage }: { currentLanguage: string }) {
  const [messages, setMessages] = useState<{id: string, text: string, isFinal: boolean, from: string, lang: string}[]>([]);
  
  useDataChannel((msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload));
      if (data.type === 'transcription') {
         setMessages(prev => {
            const existingIdx = prev.findIndex(m => m.id === data.id);
            if (existingIdx >= 0) {
              const newMsgs = [...prev];
              newMsgs[existingIdx] = data;
              return newMsgs;
            }
            return [...prev, data];
         });
      }
    } catch (e) {
      console.error('Failed to parse data message', e);
    }
  });

  return (
    <div className="flex flex-col gap-4">
       <h3 className="text-lg font-bold text-gray-800 mb-2 border-b pb-2">Live Transcription & Translation</h3>
       {messages.map((msg, idx) => (
         <div key={msg.id || idx} className={`p-3 rounded-lg max-w-[80%] ${msg.from === 'You' ? 'bg-blue-50 self-end' : 'bg-gray-100 self-start'} text-black`}>
           <div className="text-xs text-gray-500 mb-1">{msg.from}</div>
           {/* CRITICAL: BiDi Strict Isolation using <bdi> */}
           <bdi style={{ unicodeBidi: 'plaintext' }} className={`text-lg ${!msg.isFinal ? 'opacity-70 italic' : ''}`}>
             {msg.text}
           </bdi>
         </div>
       ))}
       {messages.length === 0 && (
         <p className="text-gray-400 text-center italic mt-8">Waiting for speech...</p>
       )}
    </div>
  );
}

function AudioDucker() {
  const audioTracks = useTracks([Track.Source.Microphone]).filter(t => t.participant.identity !== 'agent');
  const agentAudio = useTracks([Track.Source.Microphone]).find(t => t.participant.identity === 'agent');

  useEffect(() => {
    if (agentAudio?.publication?.isMuted === false) {
       audioTracks.forEach(t => {
         if (t.publication && t.publication.track instanceof RemoteAudioTrack) {
           t.publication.track.setVolume(0.2); // Duck to 20%
         }
       });
    } else {
       audioTracks.forEach(t => {
         if (t.publication && t.publication.track instanceof RemoteAudioTrack) {
           t.publication.track.setVolume(1.0); // Restore to 100%
         }
       });
    }
  }, [agentAudio?.publication?.isMuted, audioTracks]);

  return null;
}
