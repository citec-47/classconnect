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
  /** Whether this participant is currently putting a screen in front of the class. */
  sharingScreen: boolean;
}

type Failure =
  | 'permission'
  | 'no-devices'
  /** The browser has no getDisplayMedia at all - most mobile browsers. */
  | 'no-screen-share'
  /**
   * The camera works and the room connected, but the video could not travel.
   *
   * Distinct from `no-devices` because the remedies share nothing: this is the
   * network refusing WebRTC, not a missing camera, and telling a teacher with a
   * working camera that they have none sends them to fix the wrong thing.
   */
  | 'media-path'
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
 * The media server's address, asked for again purely to test reachability.
 *
 * Cheap, and it keeps the probe honest: it aims at the same host the failing
 * connection aimed at, rather than at one hard-coded here that could drift.
 */
async function probeUrl(
  sessionId: string,
  role: 'host' | 'guest',
  language: string,
): Promise<string | null> {
  try {
    const path =
      role === 'host'
        ? `/teacher/live/${sessionId}/token`
        : `/learner/live/${sessionId}/token`;
    const join = await api<{ url: string }>(path, { language });
    return join.url;
  } catch {
    return null;
  }
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
  /** One retry over TURN, so a blocked media path cannot loop forever. */
  const relayTriedRef = useRef(false);
  /** True when the browser is holding back everyone else's sound. */
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  /** Who replaced this participant's share, so they are told rather than left guessing. */
  const [takenOverBy, setTakenOverBy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  /** A learner's request is only a hand raised; the teacher grants publishing. */
  const [floorRequest, setFloorRequest] = useState<'idle' | 'pending' | 'approved'>('idle');
  const [requestingFloor, setRequestingFloor] = useState(false);

  /*
   * Whose screen the room is showing, if anyone's.
   *
   * First wins, and LiveKit's own rule keeps that to one: a new share replaces
   * the previous one, so two are never published at once. Picking the first
   * rather than the local participant's means the host watching a learner's
   * screen sees the learner's screen, which is the whole point of granting it.
   */
  const sharedScreen = tiles.find((tile) => tile.sharingScreen) ?? null;

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
          publication.kind === Track.Kind.Video &&
          publication.source !== Track.Source.ScreenShare &&
          publication.isSubscribed !== false &&
          !publication.isMuted,
      ),
      /*
       * A shared screen is a video track like any other, and must not be counted
       * as one here. Left in `hasVideo`, a participant sharing with their camera
       * off would show their screen squeezed into a camera tile *and* in the main
       * view — the same picture twice, neither of them the right size.
       */
      sharingScreen: participant
        .getTrackPublications()
        .some(
          (publication) =>
            publication.source === Track.Source.ScreenShare &&
            publication.isSubscribed !== false &&
            !publication.isMuted,
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
          /*
           * A screen share goes to the main view, not to the sender's tile.
           *
           * Keyed separately because a participant can send both at once — face
           * in the strip, screen in the frame — and a single key per identity
           * would put whichever arrived last into both places and lose the other.
           *
           * The element may not exist yet: the main view renders only once
           * `sharingScreen` is true, which happens on the `refreshTiles` below.
           * The effect that follows attaches it on the next render.
           */
          const key =
            track.kind !== Track.Kind.Video
              ? `audio:${participant.identity}`
              : _pub.source === Track.Source.ScreenShare
                ? `screen:${participant.identity}`
                : participant.identity;

          const element = mediaRefs.current.get(key);
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
        /*
         * The browser's own "Stop sharing" bar.
         *
         * Chrome, Edge and Firefox all put a floating control on screen while a
         * tab or window is being shared, and pressing it ends the track without
         * this application being asked. LiveKit unpublishes it and reports that
         * here — so without this the button would still read "Stop sharing", the
         * main view would wait for a screen that had gone, and the only way back
         * would be a reload.
         */
        .on(RoomEvent.LocalTrackUnpublished, (publication) => {
          if (publication.source === Track.Source.ScreenShare) {
            setScreenOn(false);
            refreshTiles(room);
          }
        })
        /*
         * Someone else started sharing, which by LiveKit's rule replaces the
         * previous share. The sharer whose screen just stopped is told why
         * rather than left wondering — see `screenTakenOver` below.
         */
        .on(RoomEvent.TrackPublished, (publication, participant) => {
          if (publication.source !== Track.Source.ScreenShare) return;
          if (roomRef.current?.localParticipant.identity !== participant.identity) {
            setScreenOn((wasSharing) => {
              if (wasSharing) setTakenOverBy(participant.name || participant.identity);
              return wasSharing ? false : wasSharing;
            });
          }
          refreshTiles(room);
        })
        .on(RoomEvent.TrackUnpublished, () => refreshTiles(room))
        .on(RoomEvent.ConnectionStateChanged, (next) => setState(next))
        .on(RoomEvent.Disconnected, () => {
          stopLocalTracks(room);
          setState(ConnectionState.Disconnected);
        });

      await room.connect(
        join.url,
        join.token,
        /*
         * `relay` rules out direct peer-to-peer paths and sends the media
         * through LiveKit's TURN server on 443. Only on the retry: forcing it
         * always would add a hop, and latency to §6.2's network is the one
         * thing this platform cannot spend freely.
         */
        relayTriedRef.current ? { rtcConfig: { iceTransportPolicy: 'relay' } } : undefined,
      );
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
          setCameraOn(false);

          /*
           * Only a camera that is genuinely absent gets called absent.
           *
           * This previously treated everything that was not a permission
           * refusal as "no camera was found", so a publish that timed out —
           * camera working, room connected, media unable to travel — told the
           * teacher their device had no camera. It sent them looking at their
           * hardware while the fault was on the network, and it was wrong on
           * screen while the log right beside it said `publishing track …
           * source: camera`.
           */
          const missing =
            error.name === 'NotFoundError' ||
            error.name === 'DevicesNotFoundError' ||
            error.name === 'OverconstrainedError';

          if (isBlocked(error)) setFailure('blocked');
          else if (error.name === 'NotAllowedError') setFailure('permission');
          else if (missing) setFailure('no-devices');
          else {
            /*
             * The camera opened and the picture had nowhere to go.
             *
             * WebRTC wants UDP, and where that is blocked it falls back to
             * LiveKit's TURN relay on 443, which looks like ordinary HTTPS.
             * The SDK does not always reach for that on its own, so one retry
             * is made with direct paths ruled out — the same reasoning as the
             * signalling relay: keep the traffic on ports this network already
             * allows. If it fails again the message says so plainly rather
             * than blaming the hardware.
             */
            setFailure('media-path');
            if (!relayTriedRef.current) {
              relayTriedRef.current = true;
              connectingRef.current = false;
              await room.disconnect();
              void connect();
              return;
            }
          }
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
      const message = (caught as Error)?.message ?? String(caught);

      /*
       * "Failed to fetch" names the symptom and hides the cause.
       *
       * It is what a browser reports for anything it refused to send — an
       * extension, tracking protection, a proxy, DNS — and it reads identically
       * to a genuine server outage. So when the signal connection fails, the
       * page asks the media server one plain question of its own and reports
       * the answer: if this reaches LiveKit, the network is fine and the
       * problem is the token or the room; if it does not, nothing in this
       * application can fix it and the browser or the network is blocking it.
       *
       * Diagnosing from the failing machine beats diagnosing from mine, which
       * can reach LiveKit perfectly well and therefore proves nothing.
       */
      let reach = '';
      try {
        const host = (await probeUrl(sessionId, role, language)) ?? '';
        if (host) {
          await fetch(host.replace(/^wss/, 'https'), {
            mode: 'no-cors',
            signal: AbortSignal.timeout(10_000),
          });
          reach = ' — the media server is reachable from this browser, so the block is not the network.';
        }
      } catch {
        reach =
          ' — this browser cannot reach the media server at all. An extension, tracking protection, a proxy or a firewall is blocking it.';
      }

      setDetail(message + reach);
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

  /**
   * Attach whichever screen is being shared, local or remote.
   *
   * Needed for the same reason as the camera effect above and one more: the main
   * view does not exist until a share is detected, so the element the subscribe
   * handler wanted was not on the page when the track arrived. This runs after
   * the render that created it.
   */
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !sharedScreen) return;

    const element = mediaRefs.current.get(`screen:${sharedScreen.identity}`);
    if (!element) return;

    const publication = sharedScreen.isLocal
      ? room.localParticipant.getTrackPublication(Track.Source.ScreenShare)
      : [...room.remoteParticipants.values()]
          .find((participant) => participant.identity === sharedScreen.identity)
          ?.getTrackPublication(Track.Source.ScreenShare);

    if (publication?.track) publication.track.attach(element as HTMLVideoElement);
  }, [tiles, sharedScreen, screenOn, state]);

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
   * Starting or stopping a screen share.
   *
   * The permission is not checked here, because a check here would be theatre:
   * the media server refuses a track from anyone whose token does not carry
   * `screen_share`, so a participant who edits this page gets a rejection from
   * LiveKit rather than a share. What this does is fail *legibly* — the browser's
   * own picker being dismissed is not an error worth a red banner, but a device
   * that cannot share at all is worth saying out loud.
   */
  const toggleScreenShare = async () => {
    const room = roomRef.current;
    if (!room) return;

    if (screenOn) {
      await room.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
      setScreenOn(false);
      refreshTiles(room);
      return;
    }

    /*
     * Most mobile browsers have no `getDisplayMedia` at all — Android Chrome
     * included, which is most of this platform's users. Told plainly here,
     * because the alternative is a button that does nothing and a teacher who
     * concludes the lesson is broken.
     */
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setFailure('no-screen-share');
      return;
    }

    try {
      await room.localParticipant.setScreenShareEnabled(true);
      setScreenOn(true);
      refreshTiles(room);
    } catch (error) {
      /*
       * Dismissing the picker throws `NotAllowedError`, and that is a decision
       * rather than a fault — saying "screen sharing failed" to someone who just
       * pressed Cancel is noise. Anything else is reported.
       */
      if ((error as Error).name !== 'NotAllowedError') {
        setFailure('no-screen-share');
        setDetail((error as Error).message || (error as Error).name);
      }
      setScreenOn(false);
    }
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

  const requestToSpeak = async () => {
    if (role !== 'guest' || requestingFloor || floorRequest === 'pending') return;
    setRequestingFloor(true);
    try {
      const request = await api<{ state: 'pending' | 'approved' }>(
        `/learner/live/${sessionId}/request-floor`,
        { method: 'POST', language },
      );
      setFloorRequest(request.state);
    } catch {
      // The API's entitlement check is authoritative. Keep the button usable
      // after an intermittent failure so the learner can try again.
    } finally {
      setRequestingFloor(false);
    }
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
      {failure === 'no-screen-share' && (
        <p className="mb-2 rounded-lg bg-warning-50 p-2 text-sm text-warning-600">
          {t('live.room.noScreenShare')}
        </p>
      )}
      {/*
        * Why a share stopped, when it was not this participant who stopped it.
        *
        * Only one screen can be shown at a time, so a second sharer replaces the
        * first — and being replaced silently looks like a fault in your own
        * machine. Dismissible, because it is news rather than a state.
        */}
      {takenOverBy && (
        <p className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-ink-100 p-2 text-sm text-ink-700">
          <span>{t('live.room.shareTakenOver', { name: takenOverBy })}</span>
          <button
            type="button"
            onClick={() => setTakenOverBy(null)}
            className="min-h-touch rounded px-2 text-xs underline"
          >
            {t('common.dismiss')}
          </button>
        </p>
      )}
      {failure === 'media-path' && (
        <p className="mb-2 rounded-lg bg-warning-50 p-2 text-sm text-warning-600">
          {t('live.room.videoBlocked')}
          {detail ? <span className="mt-1 block text-xs opacity-80">{detail}</span> : null}
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
       * The shared screen, when there is one, takes the room.
       *
       * When somebody is sharing, that is what the lesson is about — the faces
       * are context. So the screen gets the full width and the camera tiles drop
       * to a strip beneath it, which is also the arrangement the recording uses
       * (`layout: 'speaker'`), so watching it back matches being there.
       */}
      {sharedScreen && (
        <figure className="mb-2">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-ink-900">
            <video
              ref={(element) => {
                if (element) mediaRefs.current.set(`screen:${sharedScreen.identity}`, element);
                else mediaRefs.current.delete(`screen:${sharedScreen.identity}`);
              }}
              autoPlay
              playsInline
              /*
               * Muted, and only because this is the *screen*. Its audio, where
               * there is any, arrives on the sharer's own audio element — playing
               * it here as well would double every sound in the room.
               */
              muted
              className="h-full w-full object-contain"
            />
          </div>
          <figcaption className="mt-1 text-xs text-ink-600">
            {sharedScreen.isLocal
              ? t('live.room.youAreSharing')
              : t('live.room.sharingNow', { name: sharedScreen.name })}
          </figcaption>
        </figure>
      )}

      {/*
       * One column on a phone, more as the screen allows. Most learners are on
       * a handset, so the single-column case is the design rather than a
       * fallback squeezed out of a desktop grid.
       *
       * Tighter while a screen is being shared: the faces are no longer the
       * subject, and taking a third of a 360px phone for them would push the
       * thing everyone is looking at off the top of the screen.
       */}
      <div
        className={
          sharedScreen
            ? 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6'
            : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
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
        {role === 'guest' && (
          <button
            type="button"
            onClick={() => void requestToSpeak()}
            disabled={requestingFloor || floorRequest === 'pending'}
            className="min-h-touch rounded-lg border border-brand-600 px-3 text-sm font-medium text-brand-700 disabled:opacity-60"
          >
            {floorRequest === 'pending'
              ? t('student.classes.speak.asked')
              : floorRequest === 'approved'
                ? t('student.classes.speak.approved')
                : t('student.classes.speak.ask')}
          </button>
        )}
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
        {/*
         * Offered to everyone, refused by the media server for anyone whose
         * token does not carry the source.
         *
         * Hiding it from guests would make the button the access control, which
         * is the thing this codebase keeps refusing to do — and it would also
         * hide it from a learner who *has* been granted the screen, since this
         * component is not told about the grant. Pressing it without permission
         * gets a rejection from LiveKit, which is where the rule lives.
         */}
        <button
          type="button"
          onClick={() => void toggleScreenShare()}
          aria-pressed={screenOn}
          className={[
            'min-h-touch rounded-lg border px-4 text-sm',
            screenOn ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 text-ink-700',
          ].join(' ')}
        >
          {screenOn ? t('live.room.stopSharing') : t('live.room.shareScreen')}
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
