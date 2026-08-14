'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  LocalParticipant,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';

interface JoinToken {
  url: string;
  token: string;
  canPublish?: boolean;
}

/** What the tiles need, kept flat so a re-render is cheap. */
interface Tile {
  identity: string;
  name: string;
  isLocal: boolean;
  speaking: boolean;
  hasVideo: boolean;
}

type Failure =
  | 'permission'
  | 'no-devices'
  | 'connect'
  | 'blocked'
  /** Served over plain HTTP from something other than localhost. */
  | 'insecure'
  /** A browser with no `mediaDevices` API at all. */
  | 'unsupported'
  | null;

/**
 * What this browser can actually do, checked before connecting.
 *
 * Every one of these failures used to surface as the same "could not connect",
 * and they have nothing in common: a page served over plain HTTP from a LAN
 * address can never have a camera, a browser with no `mediaDevices` is missing
 * the API entirely, and a machine with no webcam is simply a machine with no
 * webcam. Finding out *before* connecting means the room can be joined in the
 * best mode this browser supports instead of failing at the first obstacle.
 */
async function preflight(): Promise<{
  secureContext: boolean;
  hasMediaApi: boolean;
}> {
  /*
   * `localhost` counts as secure even over plain HTTP; a LAN address does not.
   * That distinction is the single most common reason a camera works on the
   * developer's machine and never on the phone testing against it.
   */
  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  const hasMediaApi =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  /*
   * Deliberately no device enumeration.
   *
   * An earlier version asked `enumerateDevices()` whether a camera existed and
   * skipped the camera when it said no. Before permission is granted that call
   * is not trustworthy — Firefox, and Edge with privacy settings on, return an
   * empty list — so the answer was always "no camera" and the camera was never
   * switched on in either browser.
   *
   * Only the two facts that are knowable without a prompt are checked here.
   * Whether a camera exists is answered by asking for it.
   */
  return { secureContext, hasMediaApi };
}

/**
 * Did the *browser* block this, rather than the user refusing it?
 *
 * Firefox reports tracking protection and extension blocking as
 * `NS_ERROR_CONTENT_BLOCKED`, and Chromium-family browsers as a `SecurityError`
 * — neither is a permission the user can grant from the camera prompt, because
 * no prompt was ever shown. Telling the two apart matters: "allow the camera"
 * is useless advice to somebody whose shield icon is blocking the connection.
 */
function isBlocked(error: Error): boolean {
  const text = `${error.name} ${error.message}`;
  return (
    text.includes('NS_ERROR_CONTENT_BLOCKED') ||
    text.includes('SecurityError') ||
    text.includes('blocked')
  );
}

/**
 * The live room: video, audio and the controls over them.
 *
 * ## Where the rules live
 *
 * Nowhere here. Whether this participant may publish is decided by the signed
 * grant the server issued — this component asks the room to publish and the
 * media server refuses if the token does not allow it. So a learner without the
 * floor cannot obtain a microphone by editing the page, and the controls below
 * are a convenience over a permission that is enforced elsewhere.
 *
 * ## Ending a call
 *
 * `room.disconnect()` alone leaves the camera light on in some browsers,
 * because stopping a published track is not the same as releasing the device.
 * `stopLocalTracks` below does the second thing explicitly, and every exit path
 * goes through it — the End button, unmounting, and closing the tab.
 */
export function LiveRoom({
  sessionId,
  role,
  onEnded,
}: {
  sessionId: string;
  /** The host may end the lesson for everyone; a guest only leaves. */
  role: 'host' | 'guest';
  onEnded: () => void;
}) {
  const { t, language } = useI18n();

  const roomRef = useRef<Room | null>(null);
  const [state, setState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [failure, setFailure] = useState<Failure>(null);
  /** The underlying error text, shown so a failure is diagnosable on sight. */
  const [detail, setDetail] = useState<string | null>(null);
  const connectingRef = useRef(false);
  /** True when the browser is holding back everyone else's sound. */
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [leaving, setLeaving] = useState(false);

  /** Attached imperatively: LiveKit hands us MediaStreamTracks, not React nodes. */
  const mediaRefs = useRef(new Map<string, HTMLVideoElement | HTMLAudioElement>());

  const refreshTiles = useCallback((room: Room) => {
    const build = (participant: Participant, isLocal: boolean): Tile => ({
      identity: participant.identity,
      name: participant.name || participant.identity,
      isLocal,
      speaking: participant.isSpeaking,
      hasVideo: participant.getTrackPublications().some(
        (publication) =>
          publication.kind === Track.Kind.Video && publication.isSubscribed !== false && !publication.isMuted,
      ),
    });

    setTiles([
      build(room.localParticipant, true),
      ...[...room.remoteParticipants.values()].map((p) => build(p, false)),
    ]);
  }, []);

  /**
   * Releases the camera and microphone for real.
   *
   * The browser's indicator light is tied to the device being open, not to a
   * track being published — so unpublishing is not enough, and neither is
   * hiding the video element. Each local track is stopped explicitly.
   */
  const stopLocalTracks = useCallback((room: Room | null) => {
    if (!room) return;
    for (const publication of room.localParticipant.getTrackPublications()) {
      publication.track?.stop();
    }
  }, []);

  const connect = useCallback(async () => {
    /*
     * One connection attempt at a time.
     *
     * React runs an effect, cleans it up and runs it again in development, so
     * `connect` fired twice on mount. The first attempt succeeded and the
     * second failed against a room already in use — leaving the tiles from the
     * first connection on screen underneath a "could not connect" error, which
     * is exactly the confusing state this guard removes.
     */
    if (connectingRef.current) return;
    connectingRef.current = true;

    setFailure(null);
    setDetail(null);
    try {
      /*
       * What this browser can do, before asking it to do anything.
       *
       * A page on a LAN address over plain HTTP has no camera API at all, and
       * discovering that after connecting produces a mystifying failure in the
       * middle of a lesson rather than a sentence before it.
       */
      const checks = await preflight();
      /*
       * Reported, but not fatal.
       *
       * A browser that cannot *publish* can almost always still *subscribe* —
       * `getUserMedia` is what an insecure origin blocks, not the peer
       * connection. So the message is set and the join continues, and somebody
       * on a LAN address watches the lesson instead of staring at a refusal.
       */
      if (!checks.secureContext) setFailure('insecure');
      else if (!checks.hasMediaApi) setFailure('unsupported');

      const canUseDevices = checks.secureContext && checks.hasMediaApi;

      const path =
        role === 'host'
          ? `/teacher/live/${sessionId}/token`
          : `/learner/live/${sessionId}/token`;
      const join = await api<JoinToken>(path, { language });

      const room = new Room({
        // Let the SDK drop to a lower layer rather than freezing on §6.2's network.
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room
        .on(RoomEvent.ParticipantConnected, () => refreshTiles(room))
        .on(RoomEvent.ParticipantDisconnected, () => refreshTiles(room))
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          const element = mediaRefs.current.get(
            track.kind === Track.Kind.Video ? participant.identity : `audio:${participant.identity}`,
          );
          if (element) track.attach(element as HTMLMediaElement);
          refreshTiles(room);
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach();
          refreshTiles(room);
        })
        .on(RoomEvent.ActiveSpeakersChanged, () => refreshTiles(room))
        .on(RoomEvent.TrackMuted, () => refreshTiles(room))
        .on(RoomEvent.TrackUnmuted, () => refreshTiles(room))
        /*
         * Device failures arrive here, not from the call that caused them.
         *
         * LiveKit retries a camera or microphone internally, so a browser that
         * refuses one throws *after* `enableCameraAndMicrophone` has resolved —
         * outside any try/catch of ours, which is how a Firefox
         * `NS_ERROR_CONTENT_BLOCKED` reached Next's runtime overlay and took
         * the whole page down instead of showing a message.
         */
        .on(RoomEvent.MediaDevicesError, (deviceError: Error) => {
          setFailure(isBlocked(deviceError) ? 'blocked' : 'permission');
          setDetail(deviceError.message || deviceError.name);
          setCameraOn(false);
        })
        /*
         * Browsers refuse to play sound until the user has interacted.
         *
         * A teacher who opens the room from a link has not clicked anything
         * inside it, so the first participant to speak is silent — and nothing
         * on screen explains why. LiveKit reports this, and the remedy is one
         * gesture, so the button below appears only when it is actually needed.
         */
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          setAudioBlocked(!room.canPlaybackAudio);
        })
        .on(RoomEvent.ConnectionStateChanged, (next) => setState(next))
        .on(RoomEvent.Disconnected, () => {
          stopLocalTracks(room);
          setState(ConnectionState.Disconnected);
        });

      await room.connect(join.url, join.token);
      setState(room.state);

      /*
       * Publish only if the grant allows it.
       *
       * A learner without the floor connects, subscribes and hears the lesson;
       * asking for their camera would prompt for a permission they cannot use.
       *
       * Decided from the *token response*, not from
       * `localParticipant.permissions`. That object is populated from the
       * server's join reply and can still be undefined immediately after
       * `connect()` resolves — reading it here meant the host's camera was
       * silently never published, which is precisely the black tile this was
       * reported as.
       */
      const mayPublish = (role === 'host' ? true : join.canPublish === true) && canUseDevices;
      if (mayPublish) {
        /*
         * Camera and microphone are enabled separately, and in that order.
         *
         * `enableCameraAndMicrophone` is all-or-nothing: a blocked camera takes
         * the microphone down with it, and a teacher who could have carried on
         * by voice ends up in a silent room. Asking for each in turn means the
         * worst a blocked camera can do is cost the camera.
         */
        /*
         * Always ask. Never pre-judge from `enumerateDevices`.
         *
         * Before permission is granted, Firefox — and Edge with privacy
         * settings on — return an empty device list or entries with no `kind`.
         * Gating the camera on that meant `hasCamera` was false and
         * `setCameraEnabled` was never called at all, so the camera silently
         * never came on in either browser. The browser's own prompt is the
         * gate; asking and handling the refusal is both simpler and correct.
         */
        try {
          await room.localParticipant.setCameraEnabled(true);
          setCameraOn(true);
        } catch (cameraError) {
          const error = cameraError as Error;
          setDetail(error.message || error.name);
          setFailure(isBlocked(error) ? 'blocked' : error.name === 'NotAllowedError' ? 'permission' : 'no-devices');
          setCameraOn(false);
        }

        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          setMicOn(true);
        } catch (micError) {
          /*
           * Only reported if the camera did not already explain it. Two panels
           * saying the same thing about one blocked permission is noise.
           */
          setMicOn(false);
          setFailure((current) => current ?? (isBlocked(micError as Error) ? 'blocked' : 'permission'));
        }

      }

      refreshTiles(room);
    } catch (caught) {
      /*
       * The reason, on screen.
       *
       * "We could not connect you to the room" is true and useless — it does
       * not distinguish a blocked WebSocket from an expired token from a room
       * that is already joined, and those have completely different remedies.
       * The message goes underneath the sentence, where whoever is debugging
       * can read it without opening a console.
       */
      setFailure('connect');
      setDetail((caught as Error)?.message ?? String(caught));
    } finally {
      connectingRef.current = false;
    }
  }, [sessionId, role, language, refreshTiles, stopLocalTracks]);

  useEffect(() => {
    void connect();
    const room = roomRef.current;
    return () => {
      // Unmounting must release the devices too, not only on the End button.
      stopLocalTracks(room);
      void room?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Attach the local camera whenever it appears or changes.
   *
   * The ref callback on the tile fires when the element mounts, which is
   * usually *before* `enableCameraAndMicrophone` has finished — so the first
   * attach finds no track and the teacher sees a black rectangle of themselves.
   * Re-running whenever the tiles or the camera state change catches the track
   * once it exists.
   *
   * `attach()` on an already-attached element is a no-op, so running this more
   * often than strictly necessary costs nothing.
   */
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const element = mediaRefs.current.get(room.localParticipant.identity);
    if (!element) return;
    const camera = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (camera?.track) camera.track.attach(element as HTMLVideoElement);
  }, [tiles, cameraOn, state]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next).catch(() => undefined);
    setMicOn(next);
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOn;
    await room.localParticipant.setCameraEnabled(next).catch(() => undefined);
    setCameraOn(next);
    refreshTiles(room);
  };

  /**
   * Leaving, and — for the host — ending the lesson for everybody.
   *
   * The order matters. Devices are released first so the camera light goes out
   * immediately rather than after a round trip; the server call comes second,
   * because that is what stops the recording and the attendance clock.
   */
  const leave = async () => {
    setLeaving(true);
    const room = roomRef.current;
    stopLocalTracks(room);
    await room?.disconnect();

    if (role === 'host') {
      try {
        await api(`/teacher/live/${sessionId}/end`, {
          method: 'POST',
          language,
          timeoutMs: 120_000,
        });
      } catch {
        /*
         * The teacher has already left the room, so failing here must not trap
         * them on this screen. The sweeper closes a session nobody ended.
         */
      }
    }
    onEnded();
  };

  const connecting =
    state === ConnectionState.Connecting || state === ConnectionState.Reconnecting;

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3">
      {/* What is happening, in words, whenever it is not simply working. */}
      {/* One tap, and only while the browser is actually withholding sound. */}
      {audioBlocked && (
        <button
          type="button"
          onClick={() => void roomRef.current?.startAudio().then(() => setAudioBlocked(false))}
          className="mb-2 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
        >
          {t('live.room.enableSound')}
        </button>
      )}

      {state === ConnectionState.Reconnecting && (
        <p className="mb-2 rounded-lg bg-warning-50 p-2 text-sm text-warning-600">
          {t('live.room.reconnecting')}
        </p>
      )}
      {failure === 'permission' && (
        <p className="mb-2 rounded-lg bg-warning-50 p-2 text-sm text-warning-600">
          {t('live.room.permissionDenied')}
        </p>
      )}
      {/*
       * A different message from a refused permission, because the fix is in a
       * different place: the shield icon, not the camera prompt.
       */}
      {/*
       * The two failures no permission prompt can fix.
       *
       * A LAN address over plain HTTP has no camera API by browser policy, and
       * saying "allow the camera" there sends somebody hunting for a setting
       * that does not exist.
       */}
      {failure === 'insecure' && (
        <div className="mb-2 rounded-lg bg-warning-50 p-2">
          <p className="text-sm font-medium text-warning-600">{t('live.room.insecureTitle')}</p>
          <p className="mt-0.5 text-sm text-ink-900">{t('live.room.insecureBody')}</p>
        </div>
      )}
      {failure === 'unsupported' && (
        <p className="mb-2 rounded-lg bg-warning-50 p-2 text-sm text-warning-600">
          {t('live.room.unsupported')}
        </p>
      )}
      {failure === 'blocked' && (
        <div className="mb-2 rounded-lg bg-warning-50 p-2">
          <p className="text-sm font-medium text-warning-600">{t('live.room.blockedTitle')}</p>
          <p className="mt-0.5 text-sm text-ink-900">{t('live.room.blockedBody')}</p>
          {detail && <p className="mt-0.5 font-mono text-xs text-ink-600">{detail}</p>}
        </div>
      )}
      {failure === 'no-devices' && (
        <p className="mb-2 rounded-lg bg-warning-50 p-2 text-sm text-warning-600">
          {t('live.room.noCamera')}
        </p>
      )}
      {failure === 'connect' && (
        <div className="mb-2 rounded-lg bg-danger-50 p-2">
          <p className="text-sm text-danger-600">{t('live.room.connectFailed')}</p>
          {detail && <p className="mt-0.5 font-mono text-xs text-ink-600">{detail}</p>}
          <button type="button" onClick={() => void connect()} className="mt-1 text-sm underline">
            {t('live.room.retry')}
          </button>
        </div>
      )}

      {/*
       * One column on a phone, more as the screen allows. Most learners are on
       * a handset, so the single-column case is the design rather than a
       * fallback squeezed out of a desktop grid.
       */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.identity}
            className={`relative aspect-video overflow-hidden rounded-lg bg-ink-900 ${
              tile.speaking ? 'ring-2 ring-brand-600' : ''
            }`}
          >
            <video
              ref={(element) => {
                if (element) mediaRefs.current.set(tile.identity, element);
                else mediaRefs.current.delete(tile.identity);
                // The local camera is attached here rather than on an event,
                // because there is no subscription for one's own track.
                const room = roomRef.current;
                if (element && tile.isLocal && room) {
                  const camera = room.localParticipant.getTrackPublication(Track.Source.Camera);
                  camera?.track?.attach(element);
                }
              }}
              autoPlay
              playsInline
              // Hearing yourself half a second late makes a room unusable.
              muted={tile.isLocal}
              className={`h-full w-full object-cover ${tile.hasVideo ? '' : 'hidden'}`}
            />

            {/* A name beats a black rectangle when the camera is off. */}
            {!tile.hasVideo && (
              <div className="flex h-full w-full items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-700 text-lg font-semibold text-white">
                  {initials(tile.name)}
                </span>
              </div>
            )}

            {!tile.isLocal && (
              <audio
                ref={(element) => {
                  if (element) mediaRefs.current.set(`audio:${tile.identity}`, element);
                  else mediaRefs.current.delete(`audio:${tile.identity}`);
                }}
                autoPlay
              />
            )}

            <span className="absolute bottom-1 left-1 rounded bg-ink-900/70 px-1.5 py-0.5 text-xs text-white">
              {tile.isLocal ? t('live.room.you') : tile.name}
            </span>
          </div>
        ))}

        {tiles.length === 0 && (
          <div className="col-span-full flex aspect-video items-center justify-center rounded-lg bg-ink-100">
            <p className="text-sm text-ink-600">
              {connecting ? t('live.room.connecting') : t('live.room.noVideo')}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void toggleMic()}
          aria-pressed={!micOn}
          className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm font-medium"
        >
          {micOn ? t('live.room.muteMic') : t('live.room.unmuteMic')}
        </button>
        <button
          type="button"
          onClick={() => void toggleCamera()}
          aria-pressed={!cameraOn}
          className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm font-medium"
        >
          {cameraOn ? t('live.room.cameraOff') : t('live.room.cameraOn')}
        </button>
        <button
          type="button"
          onClick={() => void leave()}
          disabled={leaving}
          className="min-h-touch rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {leaving
            ? t('common.saving')
            : role === 'host'
              ? t('live.room.endCall')
              : t('live.room.leaveCall')}
        </button>
      </div>
    </div>
  );
}

/** "Ariane Mbeki" → "AM". Two letters at most; one for a single name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
