import asyncio
import os
import json
import logging
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import WorkerOptions, JobContext, JobRequest
from livekit.agents.llm import LLMStream, LLM
from livekit.agents.stt import STT, SpeechStream, SpeechEvent
from livekit.agents.tts import TTS

load_dotenv()
logger = logging.getLogger("livekit.agent")

class MockSpeechStream(SpeechStream):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._queue = asyncio.Queue()
    
    async def push_audio(self, frame: rtc.AudioFrame):
        # We don't process real audio for mock, just send dummy events
        # Real implementations use the frame.data
        pass

    def push_text(self, text: str):
        self._queue.put_nowait(agents.stt.SpeechEvent(
            type=agents.stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[agents.stt.SpeechData(text=text, language="en")]
        ))

    async def flush(self):
        pass

    async def aclose(self):
        pass

    async def __anext__(self):
        event = await self._queue.get()
        return event


class MockSTT(STT):
    def stream(self) -> SpeechStream:
        return MockSpeechStream()


class MockLLMStream(LLMStream):
    def __init__(self, output_text: str):
        super().__init__(None, None)
        self.output_text = output_text
        self._done = False
        self._queue = asyncio.Queue()
        self._queue.put_nowait(self.output_text)

    async def __anext__(self):
        if self._done:
            raise StopAsyncIteration
        self._done = True
        return agents.llm.ChatChunk(
            choices=[agents.llm.Choice(delta=agents.llm.ChoiceDelta(content=self.output_text, role="assistant"))]
        )
        
    async def aclose(self):
        pass

class MockLLM(LLM):
    def chat(self, chat_ctx: agents.llm.ChatContext, *args, **kwargs) -> LLMStream:
        return MockLLMStream("This is a translated mock response.")

class MockTTS(TTS):
    def synthesize(self, text: str) -> agents.tts.ChunkedStream:
        raise NotImplementedError("MockTTS doesn't generate real audio for this PoC")
    
    def stream(self):
        pass

async def handle_participant(participant: rtc.RemoteParticipant, ctx: JobContext):
    # This task processes the participant's audio
    # For a real pipeline, we use VoicePipelineAgent from livekit.agents.pipeline
    # For this PoC, we will simply intercept track subscriptions and send mock data channel messages
    
    stt = MockSTT()
    llm = MockLLM()
    
    @participant.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            logger.info(f"Subscribed to audio from {participant.identity}")
            
            # Start a background task for this participant
            asyncio.create_task(mock_conversation_loop(participant, ctx.room))
            
async def mock_conversation_loop(participant: rtc.RemoteParticipant, room: rtc.Room):
    # Simulate receiving speech after 5 seconds
    await asyncio.sleep(5)
    
    # Send STT (Transcription)
    stt_msg = {
        "type": "transcription",
        "id": f"msg-{participant.identity}-1",
        "text": "Hello, how are you?",
        "isFinal": True,
        "from": "You" if False else participant.identity, # Frontend handles "You" vs other
        "lang": "en"
    }
    
    await room.local_participant.publish_data(
        json.dumps(stt_msg).encode('utf-8'),
        topic="transcription"
    )
    
    # Simulate LLM delay
    await asyncio.sleep(2)
    
    # Send Translated Text
    translation_msg = {
        "type": "transcription",
        "id": f"msg-{participant.identity}-2",
        "text": "مرحباً، كيف حالك؟ (Translated)",
        "isFinal": True,
        "from": "Agent (Translation)",
        "lang": "ar"
    }
    
    await room.local_participant.publish_data(
        json.dumps(translation_msg).encode('utf-8'),
        topic="transcription"
    )


async def entrypoint(ctx: JobContext):
    logger.info(f"Agent starting in room: {ctx.room.name}")
    
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)
    
    ctx.room.on("participant_connected", lambda p: asyncio.create_task(handle_participant(p, ctx)))

    for participant in ctx.room.remote_participants.values():
        asyncio.create_task(handle_participant(participant, ctx))
        
    await asyncio.sleep(1000000)

if __name__ == "__main__":
    from livekit.agents.cli import run_app
    
    logging.basicConfig(level=logging.INFO)
    
    # Needs devkey and secret, matching local docker
    os.environ["LIVEKIT_URL"] = "ws://localhost:7880"
    os.environ["LIVEKIT_API_KEY"] = "devkey"
    os.environ["LIVEKIT_API_SECRET"] = "secret"

    run_app(WorkerOptions(entrypoint_fnc=entrypoint))

