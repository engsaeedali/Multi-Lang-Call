import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const roomName = req.nextUrl.searchParams.get('roomName');
  const participantName = req.nextUrl.searchParams.get('participantName');
  const language = req.nextUrl.searchParams.get('language'); // e.g. en, ar, etc

  if (!roomName) {
    return NextResponse.json({ error: 'Missing "roomName" query parameter' }, { status: 400 });
  } else if (!participantName) {
    return NextResponse.json({ error: 'Missing "participantName" query parameter' }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    name: participantName,
    metadata: JSON.stringify({ language: language || 'en' })
  });

  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

  return NextResponse.json({ token: await at.toJwt() });
}
